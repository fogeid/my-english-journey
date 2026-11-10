/**
 * ET-003 — vocabulário e revisões contra o Supabase LOCAL: RLS, unicidade, algoritmo,
 * idempotência, concorrência, exclusão e fila. Contas fictícias criadas e removidas pelo teste.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { previewIntervalMinutes, previewStreakAfter } from '../../src/features/reviews/review-schedule'
import { getLocalSupabaseEnv, runLocalSql } from './local-env'
import { deleteLocalTestAccount } from './test-accounts'

type Client = SupabaseClient<Database>
type Rating = 'again' | 'hard' | 'good' | 'easy'

const env = getLocalSupabaseEnv()
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin: Client = createClient<Database>(env.url, env.serviceRoleKey, opts)
const anon: Client = createClient<Database>(env.url, env.anonKey, opts)
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const accounts: string[] = []

interface Account {
  id: string
  client: Client
}

async function createAccount(tag: string): Promise<Account> {
  const email = `vocab-${tag}-${runId}@example.test`
  const password = `Vocab-${runId}!`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('createUser falhou')
  accounts.push(data.user.id)
  const client = createClient<Database>(env.url, env.anonKey, opts)
  const s = await client.auth.signInWithPassword({ email, password })
  if (s.error) throw s.error
  const p = await client.rpc('create_my_profile')
  if (p.error) throw p.error
  return { id: data.user.id, client }
}

function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error
  if (res.data === null || res.data === undefined) throw new Error('sem dados')
  return res.data as NonNullable<T>
}

async function addWord(acc: Account, word: string, extra: Record<string, unknown> = {}) {
  return must(
    await acc.client
      .from('vocabulary')
      .insert({ user_id: acc.id, word, translation: `t-${word}`, example_1: 'e1', example_2: 'e2', source_type: 'manual', ...extra })
      .select('*')
      .single(),
  )
}

const review = (acc: Account, id: string, rating: Rating, requestId: string = crypto.randomUUID()) =>
  acc.client.rpc('review_vocabulary', { p_vocabulary_id: id, p_rating: rating, p_request_id: requestId })

let A: Account
let B: Account
let bWord: string

beforeAll(async () => {
  A = await createAccount('a')
  B = await createAccount('b')
  bWord = (await addWord(B, 'secret')).id
  must(await review(B, bWord, 'good'))
})

afterAll(async () => {
  for (const id of accounts) await deleteLocalTestAccount(admin, id)
})

describe('9. Isolamento entre usuários e anon', () => {
  it('A não lê, altera nem apaga vocabulário/revisões de B', async () => {
    expect(must(await A.client.from('vocabulary').select('id').eq('id', bWord))).toEqual([])
    expect(must(await A.client.from('vocabulary_reviews').select('id').eq('vocabulary_id', bWord))).toEqual([])
    expect((await A.client.from('vocabulary').update({ translation: 'hack' }).eq('id', bWord).select()).data ?? []).toEqual([])
    expect((await A.client.from('vocabulary').delete().eq('id', bWord).select()).data ?? []).toEqual([])
    const row = must(await admin.from('vocabulary').select('translation').eq('id', bWord).single())
    expect(row.translation).toBe('t-secret')
  })

  it('A não revisa a palavra de B pela RPC nem grava histórico apontando para ela', async () => {
    const r = await review(A, bWord, 'easy')
    expect(r.error?.message).toMatch(/vocabulary not found/)
    const direct = await A.client.from('vocabulary_reviews').insert({ user_id: A.id, vocabulary_id: bWord, rating: 'easy' })
    expect(direct.error).not.toBeNull() // FK composta (mesmo dono) + RLS
    const forged = await A.client.from('vocabulary_reviews').insert({ user_id: B.id, vocabulary_id: bWord, rating: 'easy' })
    expect(forged.error?.code).toBe('42501')
    expect(must(await admin.from('vocabulary_reviews').select('id').eq('vocabulary_id', bWord))).toHaveLength(1)
  })

  it('A não troca o dono da própria palavra', async () => {
    const w = await addWord(A, 'mine')
    const r = await A.client.from('vocabulary').update({ user_id: B.id }).eq('id', w.id).select()
    expect(r.error !== null || (r.data ?? []).length === 0).toBe(true)
    expect(must(await admin.from('vocabulary').select('user_id').eq('id', w.id).single()).user_id).toBe(A.id)
  })

  it('anon não acessa as tabelas nem as funções', async () => {
    for (const t of ['vocabulary', 'vocabulary_reviews'] as const) {
      expect((await anon.from(t).select('id')).error?.code).toBe('42501')
    }
    for (const r of await Promise.all([
      anon.rpc('review_vocabulary', { p_vocabulary_id: bWord, p_rating: 'good', p_request_id: crypto.randomUUID() }),
      anon.rpc('get_vocabulary_summary'),
      anon.rpc('get_review_queue', {}),
      anon.rpc('list_vocabulary', {}),
    ])) {
      expect(r.error?.message).toMatch(/permission denied/)
    }
  })

  it('grants: anon sem privilégios; authenticated sem TRUNCATE/TRIGGER/REFERENCES', () => {
    const rows = runLocalSql(
      `select table_name || ':' || grantee || ':' || string_agg(privilege_type, ',' order by privilege_type)
         from information_schema.role_table_grants
        where table_schema = 'public' and table_name in ('vocabulary', 'vocabulary_reviews') and grantee in ('anon', 'authenticated')
        group by table_name, grantee order by 1`,
    )
    expect(rows).toEqual(['vocabulary:authenticated:DELETE,INSERT,SELECT,UPDATE', 'vocabulary_reviews:authenticated:DELETE,INSERT,SELECT,UPDATE'])
  })
})

describe('10. Unicidade normalizada por usuário', () => {
  it('mesma palavra com maiúsculas/espaços é rejeitada para o mesmo usuário', async () => {
    await addWord(A, 'Tired')
    const dup = await A.client.from('vocabulary').insert({ user_id: A.id, word: '  tired ', translation: 'x', example_1: 'e', example_2: 'e' })
    expect(dup.error?.code).toBe('23505')
  })

  it('a mesma palavra é permitida em contas diferentes', async () => {
    const r = await B.client.from('vocabulary').insert({ user_id: B.id, word: 'tired', translation: 'x', example_1: 'e', example_2: 'e' })
    expect(r.error).toBeNull()
  })

  it('limites e obrigatórios são garantidos pelo banco', async () => {
    const base = { user_id: A.id, translation: 'x', example_1: 'e', example_2: 'e' }
    for (const patch of [{ word: '   ' }, { word: 'x'.repeat(121) }, { word: 'ok1', example_2: '  ' }, { word: 'ok2', translation: 'x'.repeat(241) }, { word: 'ok3', notes: 'x'.repeat(1001) }]) {
      const r = await A.client.from('vocabulary').insert({ ...base, ...patch })
      expect(r.error?.code, JSON.stringify(patch).slice(0, 40)).toBe('23514')
    }
  })
})

describe('12/14. Algoritmo e atomicidade (servidor) — idêntico à prévia da UI', () => {
  it('sequência de respostas produz exatamente os intervalos e estados da tabela', async () => {
    const w = await addWord(A, 'sequence')
    const steps: [Rating, number, number][] = [
      ['good', 1440, 1],
      ['good', 3 * 1440, 2],
      ['good', 7 * 1440, 3],
      ['good', 14 * 1440, 4],
      ['good', 30 * 1440, 5],
      ['hard', 1440, 5],
      ['again', 10, 0],
      ['easy', 3 * 1440, 1],
      ['easy', 7 * 1440, 2],
      ['easy', 14 * 1440, 3],
      ['easy', 30 * 1440, 4],
    ]
    for (const [i, [rating, minutes, streak]] of steps.entries()) {
      const r = must(await review(A, w.id, rating))
      expect(r.interval_minutes, `${i}:${rating}`).toBe(minutes)
      expect(r.streak_after, `${i}:${rating}`).toBe(streak)
      expect(new Date(r.next_review_at!).getTime() - new Date(r.reviewed_at).getTime()).toBe(minutes * 60_000)
      const word = must(await A.client.from('vocabulary').select('next_review_at, review_streak, review_count, review_interval_days').eq('id', w.id).single())
      expect(word).toMatchObject({ review_streak: streak, review_count: i + 1, review_interval_days: Math.floor(minutes / 1440) })
      expect(new Date(word.next_review_at!).getTime()).toBe(new Date(r.next_review_at!).getTime())
    }
    expect(must(await A.client.from('vocabulary_reviews').select('id').eq('vocabulary_id', w.id))).toHaveLength(steps.length)
  })

  it('SQL e prévia TypeScript coincidem para sequências 0–5, 99 e 100 (limite 100)', async () => {
    const w = await addWord(A, 'crosscheck')
    for (const streak of [0, 1, 2, 3, 4, 5, 99, 100]) {
      for (const rating of ['again', 'hard', 'good', 'easy'] as Rating[]) {
        must(await admin.from('vocabulary').update({ review_streak: streak }).eq('id', w.id).select())
        const r = must(await review(A, w.id, rating))
        expect(r.interval_minutes, `${streak}:${rating}`).toBe(previewIntervalMinutes(streak, rating))
        expect(r.streak_after, `${streak}:${rating}`).toBe(previewStreakAfter(streak, rating))
      }
    }
  })

  it('entrada inválida não grava nada (nem histórico nem agendamento)', async () => {
    const w = await addWord(A, 'invalid')
    const r = await A.client.rpc('review_vocabulary', { p_vocabulary_id: w.id, p_rating: 'perfect', p_request_id: crypto.randomUUID() })
    expect(r.error?.code).toBe('22023')
    expect(must(await A.client.from('vocabulary_reviews').select('id').eq('vocabulary_id', w.id))).toHaveLength(0)
    expect(must(await A.client.from('vocabulary').select('review_count, next_review_at').eq('id', w.id).single())).toEqual({ review_count: 0, next_review_at: null })
  })
})

describe('13. Idempotência e concorrência', () => {
  it('retry com o mesmo request_id devolve a mesma revisão, sem duplicar', async () => {
    const w = await addWord(A, 'retry')
    const id = crypto.randomUUID()
    const first = must(await review(A, w.id, 'good', id))
    const second = must(await review(A, w.id, 'good', id))
    expect(second.id).toBe(first.id)
    expect(must(await A.client.from('vocabulary').select('review_count').eq('id', w.id).single()).review_count).toBe(1)
    const reused = await review(A, w.id, 'easy', id)
    expect(reused.error?.code).toBe('22023')
  })

  it('chamadas concorrentes com o mesmo request_id gravam uma única revisão', async () => {
    const w = await addWord(A, 'concurrent-same')
    const id = crypto.randomUUID()
    const results = await Promise.all(Array.from({ length: 6 }, () => review(A, w.id, 'good', id)))
    for (const r of results) expect(r.error).toBeNull()
    expect(new Set(results.map((r) => r.data!.id)).size).toBe(1)
    expect(must(await A.client.from('vocabulary_reviews').select('id').eq('vocabulary_id', w.id))).toHaveLength(1)
    expect(must(await A.client.from('vocabulary').select('review_count').eq('id', w.id).single()).review_count).toBe(1)
  })

  it('chamadas concorrentes com ids diferentes são serializadas (lock): estado consistente', async () => {
    const w = await addWord(A, 'concurrent-diff')
    const results = await Promise.all(Array.from({ length: 5 }, () => review(A, w.id, 'good')))
    for (const r of results) expect(r.error).toBeNull()
    const word = must(await A.client.from('vocabulary').select('review_count, review_streak').eq('id', w.id).single())
    expect(word).toEqual({ review_count: 5, review_streak: 5 })
    const streaks = results.map((r) => r.data!.streak_after).sort()
    expect(streaks).toEqual([1, 2, 3, 4, 5])
  })
})

describe('16. Exclusão', () => {
  it('palavra com histórico não pode ser excluída; histórico preservado', async () => {
    const w = await addWord(A, 'with-history')
    must(await review(A, w.id, 'hard'))
    const del = await A.client.from('vocabulary').delete().eq('id', w.id).select()
    expect(del.error?.code).toBe('23503')
    expect(must(await A.client.from('vocabulary_reviews').select('id').eq('vocabulary_id', w.id))).toHaveLength(1)
  })

  it('palavra sem histórico pode ser excluída', async () => {
    const w = await addWord(A, 'no-history')
    expect(must(await A.client.from('vocabulary').delete().eq('id', w.id).select())).toHaveLength(1)
  })

  it('excluir a conta continua funcionando com histórico de vocabulário (cascade)', async () => {
    const C = await createAccount('c')
    const w = await addWord(C, 'gone')
    must(await review(C, w.id, 'good'))
    const { error } = await admin.auth.admin.deleteUser(C.id)
    expect(error).toBeNull()
    accounts.splice(accounts.indexOf(C.id), 1)
    expect(must(await admin.from('vocabulary').select('id').eq('user_id', C.id))).toEqual([])
    expect(must(await admin.from('vocabulary_reviews').select('id').eq('user_id', C.id))).toEqual([])
  })
})

describe('Fila, resumo e busca (hora do servidor)', () => {
  it('fila: vencidas mais antigas primeiro, depois novas; não vencidas fora; resumo consistente', async () => {
    const D = await createAccount('d')
    const fresh1 = await addWord(D, 'fresh-1')
    const fresh2 = await addWord(D, 'fresh-2')
    const late = await addWord(D, 'due-late')
    const early = await addWord(D, 'due-early')
    const future = await addWord(D, 'future')
    const set = async (id: string, at: string) => must(await admin.from('vocabulary').update({ next_review_at: at }).eq('id', id).select())
    await set(late.id, new Date(Date.now() - 60_000).toISOString())
    await set(early.id, new Date(Date.now() - 86_400_000).toISOString())
    await set(future.id, new Date(Date.now() + 86_400_000).toISOString())

    const q = must(await D.client.rpc('get_review_queue', { p_limit: 10 }))
    expect(q.map((w) => w.word)).toEqual(['due-early', 'due-late', 'fresh-1', 'fresh-2'])
    expect(q.map((w) => w.id)).toEqual([early.id, late.id, fresh1.id, fresh2.id])

    const s = must(await D.client.rpc('get_vocabulary_summary'))[0]
    expect(s).toMatchObject({ total: 5, due: 2, new_words: 2 })

    // responder um item vencido tira-o da fila
    must(await review(D, early.id, 'good'))
    const q2 = must(await D.client.rpc('get_review_queue', { p_limit: 10 }))
    expect(q2.map((w) => w.word)).toEqual(['due-late', 'fresh-1', 'fresh-2'])
  })

  it('list_vocabulary: busca em termo/tradução com caracteres especiais, filtros, ordem e paginação', async () => {
    const E = await createAccount('e')
    await addWord(E, 'Zebra', { translation: 'zebra' })
    await addWord(E, 'apple', { translation: 'maçã' })
    await addWord(E, '100% sure', { translation: 'certeza absoluta' })
    await addWord(E, 'a_b, (test)', { translation: 'teste' })
    const list = async (p: Database['public']['Functions']['list_vocabulary']['Args']) => must(await E.client.rpc('list_vocabulary', p))

    expect((await list({})).map((r) => r.word)).toEqual(['100% sure', 'a_b, (test)', 'apple', 'Zebra'])
    expect((await list({ p_search: 'MAÇ' })).map((r) => r.word)).toEqual(['apple'])
    expect((await list({ p_search: '%' })).map((r) => r.word)).toEqual(['100% sure'])
    expect((await list({ p_search: '_' })).map((r) => r.word)).toEqual(['a_b, (test)'])
    expect((await list({ p_search: ', (' })).map((r) => r.word)).toEqual(['a_b, (test)'])
    expect((await list({ p_filter: 'new' })).length).toBe(4)
    expect((await list({ p_filter: 'due' })).length).toBe(0)
    const page = await list({ p_limit: 2, p_offset: 2 })
    expect(page.map((r) => r.word)).toEqual(['apple', 'Zebra'])
    expect(Number(page[0].total_count)).toBe(4)
  })
})
