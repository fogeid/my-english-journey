/**
 * ET-008 — sincronização Música → Vocabulário contra o Supabase LOCAL (contas fictícias criadas aqui):
 * criação, duplicatas, preservação do histórico SRS, sincronização retroativa idempotente, edição,
 * exclusão, atomicidade e isolamento por usuário.
 */
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { createSupabaseMusicService, MUSIC_MESSAGES } from '../../src/features/music/music-service'
import { getLocalSupabaseEnv, runLocalSql } from './local-env'
import { deleteLocalTestAccount } from './test-accounts'

type Client = SupabaseClient<Database>
const env = getLocalSupabaseEnv()
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin: Client = createClient<Database>(env.url, env.serviceRoleKey, opts)
const anon: Client = createClient<Database>(env.url, env.anonKey, opts)
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const accounts: string[] = []

async function createAccount(tag: string) {
  const email = `sync-${tag}-${runId}@example.test`
  const password = `Sync-${runId}!`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('createUser falhou')
  accounts.push(data.user.id)
  const client = createClient<Database>(env.url, env.anonKey, opts)
  const s = await client.auth.signInWithPassword({ email, password })
  if (s.error) throw s.error
  if ((await client.rpc('create_my_profile')).error) throw new Error('perfil')
  return { id: data.user.id, client, svc: createSupabaseMusicService(client) }
}
type Account = Awaited<ReturnType<typeof createAccount>>
function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error
  if (res.data === null || res.data === undefined) throw new Error('sem dados')
  return res.data as NonNullable<T>
}
let n = 0
const newStudy = async (acc: Account) => acc.svc.create(acc.id, { study_number: ++n, song: `Song ${n}`, artist: 'Artist', studied_on: '2026-11-12', level: 'A2', report: null })
const vocabOf = async (acc: Account) =>
  must(await acc.client.from('vocabulary').select('id, word, translation, example_1, example_2, source_type, source_ref, next_review_at, review_streak, review_count, review_interval_days').order('word'))
const wordsOf = async (acc: Account) => must(await acc.client.from('music_words').select('id, term, meaning, excerpt, vocabulary_id, music_study_id').order('created_at'))
/** Palavra "antiga" (antes da ET-008): inserida direto na tabela, sem sincronizar. */
const legacyWord = async (acc: Account, studyId: string, term: string, meaning: string | null, excerpt: string | null = null) =>
  must(await acc.client.from('music_words').insert({ user_id: acc.id, music_study_id: studyId, term, meaning, excerpt }).select('id').single()).id

let A: Account
let B: Account
beforeAll(async () => {
  A = await createAccount('a')
  B = await createAccount('b')
})
afterAll(async () => {
  for (const id of accounts) await deleteLocalTestAccount(admin, id)
})

describe('Catálogo', () => {
  it('funções SECURITY INVOKER, search_path vazio, EXECUTE só para authenticated', () => {
    const fns = ['add_music_word(uuid,text,text,text)', 'update_music_word(uuid,text,text)', 'sync_music_word(uuid)', 'sync_music_words()']
    for (const fn of fns) {
      expect(runLocalSql(`select prosecdef || ':' || array_to_string(proconfig, ',') from pg_proc where oid = 'public.${fn}'::regprocedure`), fn).toEqual(['false:search_path=""'])
      expect(runLocalSql(`select r || ':' || has_function_privilege(r, 'public.${fn}', 'execute') from unnest(array['anon','authenticated']) r order by 1`), fn).toEqual(['anon:false', 'authenticated:true'])
    }
  })
  it('exemplos do vocabulário opcionais; limites mantidos; nenhuma tabela nova', () => {
    expect(runLocalSql(`select column_name || ':' || is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'vocabulary' and column_name in ('example_1','example_2','translation') order by 1`)).toEqual([
      'example_1:YES', 'example_2:YES', 'translation:NO',
    ])
    expect(runLocalSql(`select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`)).toEqual(['14'])
  })
  it('anônimo não executa as funções', async () => {
    expect((await anon.rpc('sync_music_words')).error).not.toBeNull()
    expect((await anon.rpc('add_music_word', { p_study_id: randomUUID(), p_term: 'x', p_meaning: 'y' })).error).not.toBeNull()
  })
  it('banco ainda recusa exemplo só com espaços', async () => {
    const r = await A.client.from('vocabulary').insert({ user_id: A.id, word: `blank-${runId}`, translation: 't', example_1: '   ' })
    expect(r.error?.code).toBe('23514')
  })
})

describe('Criação e duplicatas', () => {
  it('palavra nova: cria no vocabulário (tradução = significado, exemplo 1 = trecho, origem = estudo, sem revisão) e vincula', async () => {
    const s1 = await newStudy(A)
    expect(await A.svc.addWord(s1, { term: 'heart', meaning: 'coração', excerpt: 'my heart will go on' })).toBe('created')
    const [v] = (await vocabOf(A)).filter((x) => x.word === 'heart')
    expect(v).toMatchObject({ translation: 'coração', example_1: 'my heart will go on', example_2: null, source_type: 'music', source_ref: s1, next_review_at: null, review_count: 0, review_streak: 0 })
    const [w] = (await wordsOf(A)).filter((x) => x.term === 'heart')
    expect(w.vocabulary_id).toBe(v.id)
  })

  it('mesma palavra em outra música (maiúsculas/espaços): reutiliza, sem duplicar nem sobrescrever', async () => {
    const s2 = await newStudy(A)
    expect(await A.svc.addWord(s2, { term: '  HEART ', meaning: 'outro significado', excerpt: 'outro trecho' })).toBe('linked')
    const vocab = (await vocabOf(A)).filter((x) => x.word.toLowerCase() === 'heart')
    expect(vocab).toHaveLength(1)
    expect(vocab[0]).toMatchObject({ word: 'heart', translation: 'coração', example_1: 'my heart will go on' })
    const linked = (await wordsOf(A)).filter((x) => x.term.toLowerCase() === 'heart')
    expect(linked).toHaveLength(2)
    expect(new Set(linked.map((x) => x.vocabulary_id))).toEqual(new Set([vocab[0].id]))
  })

  it('palavra existente sem exemplo: só o exemplo ausente é preenchido', async () => {
    must(await A.client.from('vocabulary').insert({ user_id: A.id, word: 'shine', translation: 'brilhar' }).select('id'))
    const s = await newStudy(A)
    expect(await A.svc.addWord(s, { term: 'Shine', meaning: 'reluzir', excerpt: 'shine bright' })).toBe('linked')
    expect((await vocabOf(A)).find((x) => x.word === 'shine')).toMatchObject({ translation: 'brilhar', example_1: 'shine bright', example_2: null, source_type: null })
  })

  it('duas inserções simultâneas da mesma palavra nova: uma cria, a outra reutiliza', async () => {
    const [s1, s2] = [await newStudy(A), await newStudy(A)]
    const results = await Promise.all([A.svc.addWord(s1, { term: 'together', meaning: 'juntos', excerpt: null }), A.svc.addWord(s2, { term: 'Together', meaning: 'juntos', excerpt: null })])
    expect(results.sort()).toEqual(['created', 'linked'])
    expect((await vocabOf(A)).filter((x) => x.word.toLowerCase() === 'together')).toHaveLength(1)
  })

  it('mesma palavra duas vezes no MESMO estudo continua recusada', async () => {
    const s = await newStudy(A)
    await A.svc.addWord(s, { term: 'again', meaning: 'de novo', excerpt: null })
    await expect(A.svc.addWord(s, { term: 'AGAIN', meaning: 'x', excerpt: null })).rejects.toMatchObject({ userMessage: MUSIC_MESSAGES.duplicateWord })
  })
})

describe('Histórico SRS', () => {
  it('palavra já revisada: vincular não altera agendamento, sequência, contagem nem histórico', async () => {
    const vid = must(await A.client.from('vocabulary').insert({ user_id: A.id, word: 'reviewed', translation: 'revisada', example_1: 'e1', example_2: 'e2' }).select('id').single()).id
    must(await A.client.rpc('review_vocabulary', { p_vocabulary_id: vid, p_rating: 'good', p_request_id: randomUUID() }))
    must(await A.client.rpc('review_vocabulary', { p_vocabulary_id: vid, p_rating: 'easy', p_request_id: randomUUID() }))
    const before = (await vocabOf(A)).find((x) => x.id === vid)!
    const reviewsBefore = must(await A.client.from('vocabulary_reviews').select('id, next_review_at').eq('vocabulary_id', vid))
    expect(before.review_count).toBe(2)

    const s = await newStudy(A)
    expect(await A.svc.addWord(s, { term: 'Reviewed', meaning: 'novo significado', excerpt: 'novo trecho' })).toBe('linked')
    const legacy = await legacyWord(A, await newStudy(A), 'REVIEWED ', 'x')
    await A.svc.syncWords()
    expect((await wordsOf(A)).find((x) => x.id === legacy)!.vocabulary_id).toBe(vid)

    expect((await vocabOf(A)).find((x) => x.id === vid)).toEqual(before)
    expect(must(await A.client.from('vocabulary_reviews').select('id, next_review_at').eq('vocabulary_id', vid))).toEqual(reviewsBefore)
  })
})

describe('Sincronização retroativa, edição e exclusão', () => {
  it('palavras antigas: cria/vincula/pendente; repetir não muda nada; editar a pendente sincroniza', async () => {
    const C = await createAccount('c')
    const s = await newStudy(C)
    must(await C.client.from('vocabulary').insert({ user_id: C.id, word: 'love', translation: 'amor' }).select('id'))
    await legacyWord(C, s, 'LOVE', null) // existe → vincula mesmo sem significado
    await legacyWord(C, s, 'sky', 'céu', 'under the sky')
    const pending = await legacyWord(C, s, 'gonna', null)
    const s2 = await newStudy(C)
    await legacyWord(C, s2, 'Sky', 'céu') // mesma palavra em outro estudo → reutiliza a recém-criada

    expect(await C.svc.syncWords()).toEqual({ created: 1, linked: 2, pending: 1 })
    const snapshot = { vocab: await vocabOf(C), words: await wordsOf(C) }
    expect(snapshot.vocab.map((v) => [v.word, v.translation, v.example_1])).toEqual([['love', 'amor', null], ['sky', 'céu', 'under the sky']])

    // idempotente: nada muda (a pendente continua pendente)
    expect(await C.svc.syncWords()).toEqual({ created: 0, linked: 0, pending: 1 })
    expect({ vocab: await vocabOf(C), words: await wordsOf(C) }).toEqual(snapshot)

    // edição: significado obrigatório; com ele, a palavra entra no vocabulário
    await expect(C.svc.updateWord(pending, { meaning: '  ', excerpt: null })).rejects.toMatchObject({ userMessage: MUSIC_MESSAGES.meaningRequired })
    expect(await C.svc.updateWord(pending, { meaning: 'vou', excerpt: 'gonna make it' })).toBe('created')
    expect((await vocabOf(C)).find((v) => v.word === 'gonna')).toMatchObject({ translation: 'vou', example_1: 'gonna make it', source_ref: s })
    expect(await C.svc.syncWords()).toEqual({ created: 0, linked: 0, pending: 0 })
  })

  it('editar palavra já vinculada muda só o estudo; excluir do estudo preserva o vocabulário', async () => {
    const s = await newStudy(A)
    await A.svc.addWord(s, { term: 'river', meaning: 'rio', excerpt: null })
    const w = (await wordsOf(A)).find((x) => x.term === 'river')!
    const before = (await vocabOf(A)).find((v) => v.word === 'river')!
    expect(await A.svc.updateWord(w.id, { meaning: 'rio (corrigido)', excerpt: 'down by the river' })).toBe('already')
    expect((await wordsOf(A)).find((x) => x.id === w.id)).toMatchObject({ meaning: 'rio (corrigido)', excerpt: 'down by the river', vocabulary_id: before.id })
    expect((await vocabOf(A)).find((v) => v.id === before.id)).toEqual(before)

    await A.svc.removeWord(w.id)
    expect((await wordsOf(A)).some((x) => x.id === w.id)).toBe(false)
    expect((await vocabOf(A)).find((v) => v.id === before.id)).toEqual(before)
  })
})

describe('Consistência: falha não grava nada pela metade', () => {
  it('significado vazio: recusado no servidor, nada gravado', async () => {
    const s = await newStudy(A)
    const r = await A.client.rpc('add_music_word', { p_study_id: s, p_term: 'empty', p_meaning: '  ' })
    expect(r.error?.code).toBe('22023')
    expect((await wordsOf(A)).some((x) => x.term === 'empty')).toBe(false)
  })

  it('falha ao criar no vocabulário desfaz também a palavra do estudo', async () => {
    const s = await newStudy(A)
    const term = `boom-${runId}`
    // gatilho TEMPORÁRIO só no banco local de teste, removido no finally
    const sql = (q: string) => execSync('docker exec -i supabase_db_my-english-journey psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q', { input: q, stdio: ['pipe', 'pipe', 'pipe'] })
    sql(`create function public.et008_test_fail() returns trigger language plpgsql as $$ begin if new.word = '${term}' then raise exception 'falha simulada'; end if; return new; end $$;
         create trigger et008_test_fail before insert on public.vocabulary for each row execute function public.et008_test_fail();`)
    try {
      await expect(A.svc.addWord(s, { term, meaning: 'x', excerpt: null })).rejects.toMatchObject({ userMessage: MUSIC_MESSAGES.save })
    } finally {
      sql('drop trigger et008_test_fail on public.vocabulary; drop function public.et008_test_fail();')
    }
    expect((await wordsOf(A)).some((x) => x.term === term)).toBe(false)
    expect((await vocabOf(A)).some((x) => x.word === term)).toBe(false)
  })
})

describe('Isolamento por usuário', () => {
  it('B com a mesma palavra de A: cria a própria, nunca reutiliza a de A', async () => {
    const s = await newStudy(B)
    expect(await B.svc.addWord(s, { term: 'heart', meaning: 'coração de B', excerpt: null })).toBe('created')
    const vb = (await vocabOf(B)).find((v) => v.word === 'heart')!
    const va = must(await admin.from('vocabulary').select('id, translation').eq('user_id', A.id).eq('word', 'heart').single())
    expect(vb.id).not.toBe(va.id)
    expect(va.translation).toBe('coração')
  })

  it('A não grava no estudo de B, não edita palavra de B e não sincroniza palavras de B', async () => {
    const sb = await newStudy(B)
    const wb = await legacyWord(B, sb, 'secret', 'segredo')
    const countB = (await vocabOf(B)).length

    const r1 = await A.client.rpc('add_music_word', { p_study_id: sb, p_term: 'intruso', p_meaning: 'x' })
    expect(r1.error).not.toBeNull()
    const r2 = await A.client.rpc('update_music_word', { p_word_id: wb, p_meaning: 'alterado' })
    expect(r2.error?.code).toBe('P0002')
    const r3 = await A.client.rpc('sync_music_word', { p_word_id: wb })
    expect(r3.error?.code).toBe('P0002')
    await A.svc.syncWords()

    expect(must(await admin.from('music_words').select('meaning, vocabulary_id').eq('id', wb).single())).toEqual({ meaning: 'segredo', vocabulary_id: null })
    expect(must(await admin.from('music_words').select('id').eq('term', 'intruso'))).toEqual([])
    expect((await vocabOf(B)).length).toBe(countB)
    expect((await vocabOf(A)).some((v) => v.word === 'secret')).toBe(false)
  })
})
