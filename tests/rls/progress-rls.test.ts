/**
 * ET-005 — leitura do progresso contra o Supabase LOCAL: isolamento entre contas e paginação
 * (o PostgREST limita 1000 linhas por requisição; o total não pode ser truncado em silêncio).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { createSupabaseProgressService } from '../../src/features/progress/progress-service'
import { computeProgress } from '../../src/features/progress/progress-model'
import { civilDateInZone } from '../../src/features/schedule/week'
import { getLocalSupabaseEnv } from './local-env'
import { deleteLocalTestAccount } from './test-accounts'

type Client = SupabaseClient<Database>
const env = getLocalSupabaseEnv()
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin: Client = createClient<Database>(env.url, env.serviceRoleKey, opts)
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const accounts: string[] = []

async function createAccount(tag: string) {
  const email = `progress-${tag}-${runId}@example.test`
  const password = `Progress-${runId}!`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('createUser falhou')
  accounts.push(data.user.id)
  const client = createClient<Database>(env.url, env.anonKey, opts)
  const s = await client.auth.signInWithPassword({ email, password })
  if (s.error) throw s.error
  if ((await client.rpc('create_my_profile')).error) throw new Error('perfil')
  return { id: data.user.id, client }
}

let A: Awaited<ReturnType<typeof createAccount>>
let B: Awaited<ReturnType<typeof createAccount>>
const REVIEWS = 1005
let base = 0 // instante de referência das revisões inseridas

beforeAll(async () => {
  A = await createAccount('a')
  B = await createAccount('b')
  // B: dados que A nunca pode ver
  const bLesson = await B.client.from('lessons').insert({ user_id: B.id, lesson_number: 1, title: 'B', studied_on: '2026-11-09', status: 'completed', difficulties: 'segredo de B' }).select('id').single()
  if (bLesson.error) throw bLesson.error
  await B.client.from('lesson_blocks').insert({ user_id: B.id, lesson_id: bLesson.data.id, block_type: 'grammar', score: 10 })
  const bWord = await B.client.from('vocabulary').insert({ user_id: B.id, word: 'secret', translation: 's', example_1: 'e', example_2: 'e' }).select('id').single()
  if (bWord.error) throw bWord.error
  await B.client.rpc('review_vocabulary', { p_vocabulary_id: bWord.data.id, p_rating: 'good', p_request_id: crypto.randomUUID() })

  // A: uma aula avaliada, uma palavra e mais de 1000 revisões (inseridas em lote só no banco local de teste)
  const aLesson = await A.client.from('lessons').insert({ user_id: A.id, lesson_number: 1, title: 'A', studied_on: '2026-11-09', status: 'completed' }).select('id').single()
  if (aLesson.error) throw aLesson.error
  await A.client.from('lesson_blocks').insert({ user_id: A.id, lesson_id: aLesson.data.id, block_type: 'listening', score: 7 })
  const aWord = await A.client.from('vocabulary').insert({ user_id: A.id, word: 'mine', translation: 'm', example_1: 'e', example_2: 'e' }).select('id').single()
  if (aWord.error) throw aWord.error
  const now = Date.now()
  base = now
  const rows = Array.from({ length: REVIEWS }, (_, i) => ({
    user_id: A.id,
    vocabulary_id: aWord.data.id,
    rating: 'good',
    reviewed_at: new Date(now - i * 60_000).toISOString(),
    request_id: crypto.randomUUID(),
  }))
  const ins = await admin.from('vocabulary_reviews').insert(rows)
  if (ins.error) throw ins.error
}, 120_000)

afterAll(async () => {
  for (const id of accounts) await deleteLocalTestAccount(admin, id)
})

describe('ET-005 — progresso', () => {
  it('lê somente os dados da própria conta (RLS)', async () => {
    const raw = await createSupabaseProgressService(A.client).load(null)
    expect(raw.lessons.map((l) => l.title)).toEqual(['A'])
    expect(raw.vocabularyCreatedAt).toHaveLength(1)
    const p = computeProgress(raw, 'all', civilDateInZone(new Date()))
    expect(p.notes.some((n) => n.difficulties === 'segredo de B')).toBe(false)
    expect(p.skills.find((s) => s.skill === 'grammar')!.average).toBeNull() // o 10 de B não aparece
    expect(p.skills.find((s) => s.skill === 'listening')!.average).toBe(7)
  })

  it('pagina além de 1000 linhas: total de revisões não é truncado', async () => {
    const raw = await createSupabaseProgressService(A.client).load(null)
    expect(raw.reviewedAt).toHaveLength(REVIEWS)
    expect(new Set(raw.reviewedAt).size).toBe(REVIEWS)
  })

  it('filtro de período no servidor reduz as linhas lidas', async () => {
    const since = new Date(base - 10 * 60_000)
    const raw = await createSupabaseProgressService(A.client).load(since)
    expect(raw.reviewedAt.length).toBe(11) // agora, -1 min … -10 min
  })
})

describe('ET-007 — estudos musicais na frequência', () => {
  it('lê só estudos musicais concluídos e só da própria conta', async () => {
    const ins = await Promise.all([
      A.client.from('music_studies').insert({ user_id: A.id, study_number: 1, song: 'A done', artist: 'x', studied_on: '2026-11-01', status: 'completed' }),
      A.client.from('music_studies').insert({ user_id: A.id, study_number: 2, song: 'A open', artist: 'x', studied_on: '2026-11-02', status: 'in_progress' }),
      B.client.from('music_studies').insert({ user_id: B.id, study_number: 1, song: 'B done', artist: 'x', studied_on: '2026-11-03', status: 'completed' }),
    ])
    for (const r of ins) expect(r.error).toBeNull()
    const raw = await createSupabaseProgressService(A.client).load(null)
    expect(raw.musicStudies).toEqual([{ studied_on: '2026-11-01', status: 'completed' }])
  })
})
