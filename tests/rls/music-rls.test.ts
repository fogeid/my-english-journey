/**
 * ET-006 — estudos musicais contra o Supabase LOCAL: RLS, propriedade nas FKs, constraints,
 * upsert de atividades, vínculo com o vocabulário sem duplicatas e cascatas.
 */
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
  const email = `music-${tag}-${runId}@example.test`
  const password = `Music-${runId}!`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('createUser falhou')
  accounts.push(data.user.id)
  const client = createClient<Database>(env.url, env.anonKey, opts)
  const s = await client.auth.signInWithPassword({ email, password })
  if (s.error) throw s.error
  if ((await client.rpc('create_my_profile')).error) throw new Error('perfil')
  return { id: data.user.id, client }
}
type Account = Awaited<ReturnType<typeof createAccount>>
function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error
  if (res.data === null || res.data === undefined) throw new Error('sem dados')
  return res.data as NonNullable<T>
}

let A: Account
let B: Account
const ids = { a: {} as Record<string, string>, b: {} as Record<string, string> }

async function seed(acc: Account, t: Record<string, string>) {
  t.study = must(await acc.client.from('music_studies').insert({ user_id: acc.id, study_number: 1, song: 'Song', artist: 'Artist', studied_on: '2026-11-10', level: 'A2' }).select('id').single()).id
  t.activity = must(await acc.client.from('music_activities').insert({ user_id: acc.id, music_study_id: t.study, activity_type: 'first_listening', notes: 'n' }).select('id').single()).id
  t.word = must(await acc.client.from('music_words').insert({ user_id: acc.id, music_study_id: t.study, term: 'count on' }).select('id').single()).id
  t.vocab = must(await acc.client.from('vocabulary').insert({ user_id: acc.id, word: `v-${acc.id.slice(0, 6)}`, translation: 't', example_1: 'e', example_2: 'e' }).select('id').single()).id
}

beforeAll(async () => {
  A = await createAccount('a')
  B = await createAccount('b')
  await seed(B, ids.b)
  await seed(A, ids.a) // mesmo número e mesmo termo em contas diferentes: permitido
})
afterAll(async () => {
  for (const id of accounts) await deleteLocalTestAccount(admin, id)
})

describe('Catálogo', () => {
  it('RLS habilitado; anon sem privilégios; authenticated sem TRUNCATE', () => {
    expect(runLocalSql(`select relname || ':' || relrowsecurity from pg_class where relname in ('music_activities', 'music_words') order by 1`)).toEqual(['music_activities:true', 'music_words:true'])
    const grants = runLocalSql(
      `select table_name || ':' || grantee || ':' || string_agg(privilege_type, ',' order by privilege_type)
         from information_schema.role_table_grants
        where table_schema = 'public' and table_name in ('music_studies', 'music_activities', 'music_words') and grantee in ('anon', 'authenticated')
        group by table_name, grantee order by 1`,
    )
    expect(grants).toEqual([
      'music_activities:authenticated:DELETE,INSERT,SELECT,UPDATE',
      'music_studies:authenticated:DELETE,INSERT,SELECT,UPDATE',
      'music_words:authenticated:DELETE,INSERT,SELECT,UPDATE',
    ])
  })
})

describe('Isolamento', () => {
  it.each(['music_studies', 'music_activities', 'music_words'] as const)('A não lê %s de B', async (t) => {
    const r = await A.client.from(t).select('user_id')
    expect(r.error).toBeNull()
    expect(r.data!.length).toBeGreaterThan(0)
    expect(r.data!.every((x) => x.user_id === A.id)).toBe(true)
  })

  it('A não altera nem apaga atividades/palavras de B', async () => {
    expect((await A.client.from('music_activities').update({ notes: 'hack' }).eq('id', ids.b.activity).select()).data ?? []).toEqual([])
    expect((await A.client.from('music_words').delete().eq('id', ids.b.word).select()).data ?? []).toEqual([])
    expect((await A.client.from('music_studies').delete().eq('id', ids.b.study).select()).data ?? []).toEqual([])
    expect(must(await admin.from('music_activities').select('notes').eq('id', ids.b.activity).single()).notes).toBe('n')
    expect(must(await admin.from('music_words').select('id').eq('id', ids.b.word))).toHaveLength(1)
  })

  it('A não vincula atividade/palavra ao estudo de B nem palavra ao vocabulário de B (INSERT e UPDATE)', async () => {
    const r1 = await A.client.from('music_activities').insert({ user_id: A.id, music_study_id: ids.b.study, activity_type: 'vocabulary', notes: 'x' })
    expect(r1.error?.message).toMatch(/music_activities_owner_study_fk/)
    const r2 = await A.client.from('music_words').insert({ user_id: A.id, music_study_id: ids.b.study, term: 'x' })
    expect(r2.error?.message).toMatch(/music_words_owner_study_fk/)
    const r3 = await A.client.from('music_words').update({ vocabulary_id: ids.b.vocab }).eq('id', ids.a.word)
    expect(r3.error?.message).toMatch(/music_words_owner_vocabulary_fk/)
    const r4 = await A.client.from('music_activities').update({ music_study_id: ids.b.study }).eq('id', ids.a.activity)
    expect(r4.error).not.toBeNull()
  })

  it('anon não acessa', async () => {
    for (const t of ['music_studies', 'music_activities', 'music_words'] as const) expect((await anon.from(t).select('id')).error?.code).toBe('42501')
  })
})

describe('Constraints', () => {
  it('número único por usuário; nível, status, notas 0–10 e nomes validados', async () => {
    expect((await A.client.from('music_studies').insert({ user_id: A.id, study_number: 1, song: 's', artist: 'a' })).error?.code).toBe('23505')
    for (const patch of [{ level: 'Z9' }, { status: 'paused' }, { initial_score: 10.5 }, { final_score: -1 }, { song: ' ' }, { artist: 'x'.repeat(201) }]) {
      const r = await A.client.from('music_studies').insert({ user_id: A.id, study_number: 99, song: 's', artist: 'a', ...patch })
      expect(r.error?.code, JSON.stringify(patch).slice(0, 40)).toBe('23514')
    }
  })
  it('uma atividade por tipo; campos e trecho curto limitados; termo único por estudo (normalizado)', async () => {
    expect((await A.client.from('music_activities').insert({ user_id: A.id, music_study_id: ids.a.study, activity_type: 'first_listening' })).error?.code).toBe('23505')
    expect((await A.client.from('music_activities').insert({ user_id: A.id, music_study_id: ids.a.study, activity_type: 'karaoke' })).error?.code).toBe('23514')
    expect((await A.client.from('music_activities').insert({ user_id: A.id, music_study_id: ids.a.study, activity_type: 'translation', my_answers: 'x'.repeat(2001) })).error?.code).toBe('23514')
    expect((await A.client.from('music_words').insert({ user_id: A.id, music_study_id: ids.a.study, term: 'y', excerpt: 'x'.repeat(301) })).error?.code).toBe('23514')
    expect((await A.client.from('music_words').insert({ user_id: A.id, music_study_id: ids.a.study, term: '  COUNT ON ' })).error?.code).toBe('23505')
  })
  it('compatibilidade ET-001: estudo só com música e artista continua válido', async () => {
    const r = must(await A.client.from('music_studies').insert({ user_id: A.id, song: 'Legacy', artist: 'X' }).select('status, study_number').single())
    expect(r).toEqual({ status: 'in_progress', study_number: null })
  })
})

describe('music-service real: atividades, compreensão e vocabulário sem duplicatas', () => {
  it('fluxo completo', async () => {
    const C = await createAccount('c')
    const svc = createSupabaseMusicService(C.client)
    const id = await svc.create(C.id, { study_number: 1, song: 'Count on Me', artist: 'Bruno Mars', studied_on: '2026-11-10', level: 'A2', report: null })
    await svc.saveActivity(C.id, id, 'vocabulary', { my_answers: 'a', difficulties: null, corrections: null, explanations: null, notes: null })
    await svc.saveActivity(C.id, id, 'vocabulary', { my_answers: 'b', difficulties: 'd', corrections: null, explanations: null, notes: null }) // upsert
    await svc.setComprehension(id, 'initial', { score: 4, comment: 'pouco' })
    await svc.setComprehension(id, 'final', { score: 7.5, comment: null })
    expect(await svc.addWord(id, { term: 'count on', meaning: 'contar com', excerpt: 'You can count on me' })).toBe('created')
    expect(await svc.addWord(id, { term: '100%_sure', meaning: 'certeza', excerpt: null })).toBe('created')
    await expect(svc.addWord(id, { term: 'Count On', meaning: 'x', excerpt: null })).rejects.toMatchObject({ userMessage: MUSIC_MESSAGES.duplicateWord })
    await expect(svc.create(C.id, { study_number: 1, song: 'x', artist: 'y', studied_on: '2026-11-10', level: 'A1', report: null })).rejects.toMatchObject({ userMessage: MUSIC_MESSAGES.duplicateNumber })

    let s = (await svc.get(id))!
    expect(s.music_activities).toHaveLength(1)
    expect(s.music_activities[0]).toMatchObject({ my_answers: 'b', difficulties: 'd' })
    expect([Number(s.initial_score), Number(s.final_score), s.initial_comprehension]).toEqual([4, 7.5, 'pouco'])
    // ET-008: as duas palavras entraram no vocabulário (origem = este estudo), sem duplicar
    const vocab = must(await C.client.from('vocabulary').select('id, word, source_type, source_ref').order('word'))
    expect(vocab.map((v) => v.word)).toEqual(['100%_sure', 'count on'])
    expect(vocab.every((v) => v.source_type === 'music' && v.source_ref === id)).toBe(true)
    expect(s.music_words.every((w) => w.vocabulary_id !== null)).toBe(true)

    // excluir o estudo: atividades e palavras do estudo somem; a palavra do vocabulário fica (origem → nula)
    await svc.remove(id)
    expect(must(await admin.from('music_activities').select('id').eq('music_study_id', id))).toEqual([])
    expect(must(await admin.from('music_words').select('id').eq('music_study_id', id))).toEqual([])
    expect(must(await C.client.from('vocabulary').select('source_ref').in('id', vocab.map((v) => v.id))).map((v) => v.source_ref)).toEqual([null, null])
  })

  it('excluir a palavra do vocabulário só anula o vínculo na palavra do estudo', async () => {
    const D = await createAccount('d')
    const svc = createSupabaseMusicService(D.client)
    const id = await svc.create(D.id, { study_number: 1, song: 's', artist: 'a', studied_on: '2026-11-10', level: 'A1', report: null })
    await svc.addWord(id, { term: 'hello', meaning: 'olá', excerpt: null })
    const vid = (await svc.get(id))!.music_words[0].vocabulary_id!
    expect(must(await D.client.from('vocabulary').delete().eq('id', vid).select())).toHaveLength(1)
    expect((await svc.get(id))!.music_words[0]).toMatchObject({ term: 'hello', vocabulary_id: null })
  })

  it('excluir a conta remove estudos, atividades e palavras (cascade)', async () => {
    const E = await createAccount('e')
    await seed(E, {})
    expect((await admin.auth.admin.deleteUser(E.id)).error).toBeNull()
    accounts.splice(accounts.indexOf(E.id), 1)
    for (const t of ['music_studies', 'music_activities', 'music_words'] as const) expect(must(await admin.from(t).select('id').eq('user_id', E.id))).toEqual([])
  })
})
