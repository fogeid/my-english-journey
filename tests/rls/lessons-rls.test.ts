/**
 * ET-004 — aulas, blocos e exercícios contra o Supabase LOCAL: RLS, propriedade nas FKs,
 * constraints, cascatas e compatibilidade com ET-001/ET-003. Contas fictícias do próprio teste.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { createSupabaseLessonService } from '../../src/features/lessons/lesson-service'
import { overallScore } from '../../src/features/lessons/lesson-model'
import { getLocalSupabaseEnv, runLocalSql } from './local-env'
import { deleteLocalTestAccount } from './test-accounts'

type Client = SupabaseClient<Database>
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
  const email = `lessons-${tag}-${runId}@example.test`
  const password = `Lessons-${runId}!`
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

let A: Account
let B: Account
const b = {} as { lesson: string; block: string; exercise: string }
const a = {} as { lesson: string; block: string; exercise: string }

async function seed(acc: Account, target: typeof b, n: number) {
  target.lesson = must(
    await acc.client
      .from('lessons')
      .insert({ user_id: acc.id, lesson_number: n, title: `Aula ${n}`, studied_on: '2026-11-10', level: 'A1', topics: ['greetings'] })
      .select('id')
      .single(),
  ).id
  target.block = must(await acc.client.from('lesson_blocks').insert({ user_id: acc.id, lesson_id: target.lesson, block_type: 'grammar', score: 8 }).select('id').single()).id
  target.exercise = must(
    await acc.client.from('lesson_exercises').insert({ user_id: acc.id, block_id: target.block, prompt: 'Complete', my_answer: 'x', corrected_answer: 'y' }).select('id').single(),
  ).id
}

beforeAll(async () => {
  A = await createAccount('a')
  B = await createAccount('b')
  await seed(B, b, 1)
  await seed(A, a, 1) // mesmo número em contas diferentes é permitido
})
afterAll(async () => {
  for (const id of accounts) await deleteLocalTestAccount(admin, id)
})

describe('Catálogo', () => {
  it('lesson_blocks e lesson_exercises: RLS habilitado; anon sem privilégios; authenticated sem TRUNCATE', () => {
    expect(runLocalSql(`select relname || ':' || relrowsecurity from pg_class where relname in ('lesson_blocks', 'lesson_exercises') order by 1`)).toEqual([
      'lesson_blocks:true',
      'lesson_exercises:true',
    ])
    const grants = runLocalSql(
      `select table_name || ':' || grantee || ':' || string_agg(privilege_type, ',' order by privilege_type)
         from information_schema.role_table_grants
        where table_schema = 'public' and table_name in ('lessons', 'lesson_blocks', 'lesson_exercises') and grantee in ('anon', 'authenticated')
        group by table_name, grantee order by 1`,
    )
    expect(grants).toEqual([
      'lesson_blocks:authenticated:DELETE,INSERT,SELECT,UPDATE',
      'lesson_exercises:authenticated:DELETE,INSERT,SELECT,UPDATE',
      'lessons:authenticated:DELETE,INSERT,SELECT,UPDATE',
    ])
  })
})

describe('Isolamento entre usuários', () => {
  it.each(['lessons', 'lesson_blocks', 'lesson_exercises'] as const)('A não lê %s de B', async (table) => {
    const res = await A.client.from(table).select('user_id')
    expect(res.error).toBeNull()
    expect(res.data!.length).toBeGreaterThan(0)
    expect(res.data!.every((r) => r.user_id === A.id)).toBe(true)
  })

  it('A não altera nem apaga blocos/exercícios de B', async () => {
    expect((await A.client.from('lesson_blocks').update({ score: 0 }).eq('id', b.block).select()).data ?? []).toEqual([])
    expect((await A.client.from('lesson_exercises').update({ prompt: 'hack' }).eq('id', b.exercise).select()).data ?? []).toEqual([])
    expect((await A.client.from('lesson_exercises').delete().eq('id', b.exercise).select()).data ?? []).toEqual([])
    expect((await A.client.from('lesson_blocks').delete().eq('id', b.block).select()).data ?? []).toEqual([])
    expect((await A.client.from('lessons').delete().eq('id', b.lesson).select()).data ?? []).toEqual([])
    const blk = must(await admin.from('lesson_blocks').select('score').eq('id', b.block).single())
    expect(Number(blk.score)).toBe(8)
    expect(must(await admin.from('lesson_exercises').select('prompt').eq('id', b.exercise).single()).prompt).toBe('Complete')
  })

  it('A não vincula bloco à aula de B nem exercício ao bloco de B (INSERT e UPDATE)', async () => {
    const r1 = await A.client.from('lesson_blocks').insert({ user_id: A.id, lesson_id: b.lesson, block_type: 'reading' })
    expect(r1.error?.message).toMatch(/lesson_blocks_owner_lesson_fk/)
    const r2 = await A.client.from('lesson_exercises').insert({ user_id: A.id, block_id: b.block, prompt: 'x' })
    expect(r2.error?.message).toMatch(/lesson_exercises_owner_block_fk/)
    const r3 = await A.client.from('lesson_blocks').update({ lesson_id: b.lesson }).eq('id', a.block)
    expect(r3.error).not.toBeNull()
    const r4 = await A.client.from('lesson_exercises').update({ block_id: b.block }).eq('id', a.exercise)
    expect(r4.error).not.toBeNull()
    const r5 = await A.client.from('lesson_blocks').insert({ user_id: B.id, lesson_id: b.lesson, block_type: 'reading' })
    expect(r5.error?.code).toBe('42501')
  })

  it('anon não acessa as tabelas de aulas', async () => {
    for (const t of ['lessons', 'lesson_blocks', 'lesson_exercises'] as const) {
      expect((await anon.from(t).select('id')).error?.code).toBe('42501')
    }
  })
})

describe('Constraints', () => {
  it('número único por usuário; nível, status, título e assuntos validados', async () => {
    expect((await A.client.from('lessons').insert({ user_id: A.id, lesson_number: 1, title: 'dup' })).error?.code).toBe('23505')
    for (const patch of [{ level: 'Z1' }, { status: 'paused' }, { title: '   ' }, { title: 'x'.repeat(201) }, { topics: Array.from({ length: 31 }, (_, i) => `t${i}`) }]) {
      const r = await A.client.from('lessons').insert({ user_id: A.id, lesson_number: 900, ...patch })
      expect(r.error?.code, JSON.stringify(patch).slice(0, 40)).toBe('23514')
    }
  })

  it('um bloco por tipo e aula; nota 0–10 com 1 casa decimal', async () => {
    expect((await A.client.from('lesson_blocks').insert({ user_id: A.id, lesson_id: a.lesson, block_type: 'grammar' })).error?.code).toBe('23505')
    expect((await A.client.from('lesson_blocks').insert({ user_id: A.id, lesson_id: a.lesson, block_type: 'pronunciation' })).error?.code).toBe('23514')
    expect((await A.client.from('lesson_blocks').update({ score: 10.5 }).eq('id', a.block)).error?.code).toBe('23514')
    expect((await A.client.from('lesson_blocks').update({ score: -1 }).eq('id', a.block)).error?.code).toBe('23514')
    const ok = must(await A.client.from('lesson_blocks').update({ score: 9.5 }).eq('id', a.block).select('score').single())
    expect(Number(ok.score)).toBe(9.5)
  })

  it('exercício exige enunciado', async () => {
    expect((await A.client.from('lesson_exercises').insert({ user_id: A.id, block_id: a.block, prompt: '  ' })).error?.code).toBe('23514')
  })

  it('compatibilidade ET-001: aula só com número continua válida (status padrão em andamento)', async () => {
    const r = must(await A.client.from('lessons').insert({ user_id: A.id, lesson_number: 77 }).select('status, title, level').single())
    expect(r).toEqual({ status: 'in_progress', title: null, level: null })
  })
})

describe('Cascatas e integrações', () => {
  it('excluir aula exclui blocos e exercícios; limpa a origem do vocabulário (ET-001/003)', async () => {
    const C = await createAccount('c')
    const t = {} as typeof b
    await seed(C, t, 5)
    const word = must(
      await C.client
        .from('vocabulary')
        .insert({ user_id: C.id, word: 'hello', translation: 'olá', example_1: 'e1', example_2: 'e2', source_type: 'lesson', source_ref: t.lesson })
        .select('id')
        .single(),
    ).id
    expect(must(await C.client.from('lessons').delete().eq('id', t.lesson).select())).toHaveLength(1)
    expect(must(await admin.from('lesson_blocks').select('id').eq('lesson_id', t.lesson))).toEqual([])
    expect(must(await admin.from('lesson_exercises').select('id').eq('block_id', t.block))).toEqual([])
    expect(must(await admin.from('vocabulary').select('source_ref').eq('id', word).single()).source_ref).toBeNull()
  })

  it('excluir a conta remove aulas, blocos e exercícios (cascade)', async () => {
    const D = await createAccount('d')
    await seed(D, {} as typeof b, 1)
    expect((await admin.auth.admin.deleteUser(D.id)).error).toBeNull()
    accounts.splice(accounts.indexOf(D.id), 1)
    for (const t of ['lessons', 'lesson_blocks', 'lesson_exercises'] as const) {
      expect(must(await admin.from(t).select('id').eq('user_id', D.id))).toEqual([])
    }
  })
})

describe('lesson-service real contra o banco local', () => {
  it('fluxo completo: criar, blocos com nota, exercícios, concluir, listar com nota geral', async () => {
    const E = await createAccount('e')
    const svc = createSupabaseLessonService(E.client)
    const id = await svc.create(E.id, { lesson_number: 3, title: 'Past simple', studied_on: '2026-11-10', level: 'A2', topics: ['past simple'], report: null })
    await svc.addBlock(E.id, id, 'grammar')
    await svc.addBlock(E.id, id, 'listening')
    await expect(svc.addBlock(E.id, id, 'grammar')).rejects.toMatchObject({ userMessage: 'Este bloco já existe nesta aula.' })
    let lesson = (await svc.get(id))!
    const [g, l] = lesson.lesson_blocks.sort((x, y) => x.block_type.localeCompare(y.block_type))
    await svc.updateBlock(g.id, { score: 7.5, notes: null })
    await svc.updateBlock(l.id, { score: 8, notes: 'bom' })
    await svc.addExercise(E.id, g.id, { prompt: 'She ___ (go)', my_answer: 'goed', corrected_answer: 'went', explanation: 'irregular' })
    await svc.update(id, { difficulties: 'th', recommendations: 'minimal pairs' })
    await svc.setStatus(id, 'completed')
    await expect(svc.create(E.id, { lesson_number: 3, title: 'dup', studied_on: '2026-11-10', level: 'A2', topics: [], report: null })).rejects.toMatchObject({
      userMessage: 'Já existe uma aula com este número.',
    })

    lesson = (await svc.get(id))!
    expect(lesson).toMatchObject({ status: 'completed', difficulties: 'th', recommendations: 'minimal pairs' })
    expect(lesson.lesson_blocks.flatMap((x) => x.lesson_exercises)).toHaveLength(1)
    const [summary] = await svc.list()
    expect(overallScore(summary.lesson_blocks.map((x) => ({ score: x.score === null ? null : Number(x.score) })))).toBe(7.8)

    const completed = await E.client.from('lessons').select('id', { count: 'exact', head: true }).eq('status', 'completed')
    expect(completed.count).toBe(1)
    expect(await svc.get('00000000-0000-4000-8000-000000000000')).toBeNull()
  })
})
