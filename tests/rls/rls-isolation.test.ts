/**
 * Teste integrado de RLS e integridade — ET-001, teste obrigatório 7.
 * Roda SOMENTE contra o Supabase local (ver local-env.ts).
 *
 * Cria duas contas fictícias locais (A e B), dados mínimos de teste para B e A,
 * e verifica que:
 *  - A não lê, altera nem apaga dados de B;
 *  - A não vincula registros filhos a recursos de B;
 *  - anônimo não lê dados nem executa create_my_profile;
 *  - create_my_profile rejeita auth.uid() nulo;
 *  - FKs compostas com SET NULL anulam só a coluna opcional (user_id preservado);
 *  - vocabulary.source_ref respeita tipo e dono.
 * Os usuários de teste são removidos ao final (cascade remove os dados).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { getLocalSupabaseEnv, runLocalSql } from './local-env'
import { deleteLocalTestAccount } from './test-accounts'

type Client = SupabaseClient<Database>
type TableName = keyof Database['public']['Tables']
/** Tabelas com coluna id (todas exceto profiles). */
type IdTable = Exclude<TableName, 'profiles'>

const TABLES: TableName[] = [
  'profiles',
  'study_plans',
  'study_activities',
  'study_sessions',
  'lessons',
  'vocabulary',
  'vocabulary_reviews',
  'music_studies',
  'skill_assessments',
]

const env = getLocalSupabaseEnv()
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin: Client = createClient<Database>(env.url, env.serviceRoleKey, opts)
const anon: Client = createClient<Database>(env.url, env.anonKey, opts)

interface Account {
  id: string
  email: string
  client: Client
}

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const PASSWORD = `Rls-Test-${runId}!`

async function createAccount(tag: string): Promise<Account> {
  const email = `rls-${tag}-${runId}@example.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('createUser falhou')
  const client = createClient<Database>(env.url, env.anonKey, opts)
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signIn.error) throw signIn.error
  const profile = await client.rpc('create_my_profile')
  if (profile.error) throw profile.error
  return { id: data.user.id, email, client }
}

function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error
  if (res.data === null) throw new Error('sem dados')
  return res.data as NonNullable<T>
}

let A: Account
let B: Account
const b = {} as Record<
  'plan' | 'activity' | 'session' | 'lesson' | 'vocab' | 'review' | 'music' | 'assessment',
  string
>
const a = {} as Record<'plan' | 'activity' | 'session' | 'lesson' | 'vocab' | 'review' | 'music' | 'assessment', string>

async function seedFor(acc: Account, target: Record<string, string>) {
  const c = acc.client
  const uid = acc.id
  target.plan = must(await c.from('study_plans').insert({ user_id: uid, week_start: '2026-11-09', title: 'teste' }).select('id').single()).id
  target.activity = must(
    await c
      .from('study_activities')
      .insert({ user_id: uid, plan_id: target.plan, study_day: '2026-11-09', skill: 'grammar', title: 'teste', planned_minutes: 30 })
      .select('id')
      .single(),
  ).id
  target.session = must(
    await c.from('study_sessions').insert({ user_id: uid, activity_id: target.activity, actual_minutes: 10 }).select('id').single(),
  ).id
  target.lesson = must(await c.from('lessons').insert({ user_id: uid, lesson_number: 1 }).select('id').single()).id
  target.music = must(await c.from('music_studies').insert({ user_id: uid, song: 'teste', artist: 'teste' }).select('id').single()).id
  target.vocab = must(
    await c
      .from('vocabulary')
      .insert({ user_id: uid, word: `w-${uid.slice(0, 8)}`, translation: 't', example_1: 'e1', example_2: 'e2', source_type: 'lesson', source_ref: target.lesson })
      .select('id')
      .single(),
  ).id
  target.assessment = must(
    await c
      .from('skill_assessments')
      .insert({ user_id: uid, skill: 'grammar', assessment_date: '2026-11-09', lesson_id: target.lesson, score: 5, score_max: 10 })
      .select('id')
      .single(),
  ).id
}

beforeAll(async () => {
  A = await createAccount('a')
  B = await createAccount('b')
  await seedFor(B, b)
  b.review = must(
    await B.client.from('vocabulary_reviews').insert({ user_id: B.id, vocabulary_id: b.vocab, rating: 'good' }).select('id').single(),
  ).id
  await seedFor(A, a)
  a.review = must(
    await A.client.from('vocabulary_reviews').insert({ user_id: A.id, vocabulary_id: a.vocab, rating: 'hard' }).select('id').single(),
  ).id
})

afterAll(async () => {
  for (const acc of [A, B]) {
    if (acc) await deleteLocalTestAccount(admin, acc.id)
  }
})

describe('Catálogo do banco', () => {
  // ET-004 acrescentou lesson_blocks e lesson_exercises; ET-006, music_activities e music_words —
  // todas com a mesma regra (RLS + 4 policies por dono).
  const ALL_TABLES = [...TABLES, 'lesson_blocks', 'lesson_exercises', 'music_activities', 'music_words']

  it('as nove tabelas existem em public e todas têm RLS habilitado', () => {
    const rows = runLocalSql(
      `select c.relname || ':' || c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    )
    expect(rows.sort()).toEqual([...ALL_TABLES].sort().map((t) => `${t}:true`))
  })

  it('políticas: 4 por tabela, exceto profiles (select/update apenas), todas para authenticated', () => {
    const rows = runLocalSql(
      `select tablename || ':' || cmd || ':' || array_to_string(roles, ',') from pg_policies where schemaname = 'public' order by 1`,
    )
    const expected = ALL_TABLES.flatMap((t) =>
      t === 'profiles'
        ? [`${t}:SELECT:authenticated`, `${t}:UPDATE:authenticated`]
        : ['DELETE', 'INSERT', 'SELECT', 'UPDATE'].map((cmd) => `${t}:${cmd}:authenticated`),
    )
    expect(rows.sort()).toEqual(expected.sort())
  })

  it('create_my_profile: EXECUTE só para authenticated (e roles administrativas)', () => {
    const rows = runLocalSql(
      `select r || ':' || has_function_privilege(r, 'public.create_my_profile()', 'execute')
         from unnest(array['anon','authenticated']) r order by 1`,
    )
    expect(rows).toEqual(['anon:false', 'authenticated:true'])
    // Nenhuma entrada de ACL para PUBLIC (formato "=X/owner").
    const acl = runLocalSql(
      `select a::text from pg_proc p, unnest(p.proacl) a where p.oid = 'public.create_my_profile()'::regprocedure`,
    )
    expect(acl.some((entry) => entry.startsWith('='))).toBe(false)
    expect(acl.some((entry) => entry.startsWith('anon='))).toBe(false)
  })
})

describe('Anônimo', () => {
  it.each(TABLES)('não lê dados de %s', async (table) => {
    const { data, error } = await anon.from(table).select('*')
    // Ou erro de permissão, ou zero linhas — nunca dados.
    if (!error) expect(data).toEqual([])
  })

  it('não executa create_my_profile', async () => {
    const { data, error } = await anon.rpc('create_my_profile')
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('não insere dados', async () => {
    const { error } = await anon.from('lessons').insert({ user_id: B.id, lesson_number: 99 })
    expect(error).not.toBeNull()
  })
})

describe('create_my_profile', () => {
  it('é idempotente para o próprio usuário', async () => {
    const first = must(await A.client.rpc('create_my_profile'))
    const second = must(await A.client.rpc('create_my_profile'))
    expect(first.user_id).toBe(A.id)
    expect(second).toEqual(first)
  })

  it('rejeita auth.uid() nulo (chamada sem usuário, com service_role)', async () => {
    const before = await admin.from('profiles').select('user_id', { count: 'exact', head: true })
    const { data, error } = await admin.rpc('create_my_profile')
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/not authenticated/)
    expect(data).toBeNull()
    const after = await admin.from('profiles').select('user_id', { count: 'exact', head: true })
    expect(after.count).toBe(before.count)
  })

  it('cliente não insere nem apaga perfis diretamente', async () => {
    const ins = await A.client.from('profiles').insert({ user_id: A.id })
    expect(ins.error).not.toBeNull()
    const del = await A.client.from('profiles').delete().eq('user_id', A.id).select()
    expect(del.data ?? []).toEqual([])
    const still = must(await admin.from('profiles').select('user_id').eq('user_id', A.id))
    expect(still).toHaveLength(1)
  })
})

describe('Usuário A não acessa dados de B', () => {
  it.each(TABLES)('A não lê linhas de B em %s', async (table) => {
    // Pré-condição: B de fato tem linhas nesta tabela (senão o teste seria trivial).
    const ofB = await admin.from(table).select('user_id', { count: 'exact', head: true }).eq('user_id', B.id)
    expect(ofB.count).toBeGreaterThan(0)

    const { data, error } = await A.client.from(table).select('user_id')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0) // A vê os próprios dados
    expect(data!.every((r) => r.user_id === A.id)).toBe(true)
  })

  it('A não lê registro de B mesmo filtrando pelo id', async () => {
    const res = await A.client.from('lessons').select('*').eq('id', b.lesson)
    expect(res.data).toEqual([])
    const prof = await A.client.from('profiles').select('*').eq('user_id', B.id)
    expect(prof.data).toEqual([])
  })

  const updates: [IdTable, keyof typeof b, Record<string, unknown>][] = [
    ['study_plans', 'plan', { title: 'hack' }],
    ['study_activities', 'activity', { title: 'hack' }],
    ['study_sessions', 'session', { notes: 'hack' }],
    ['lessons', 'lesson', { report: 'hack' }],
    ['vocabulary', 'vocab', { translation: 'hack' }],
    ['vocabulary_reviews', 'review', { rating: 'again' }],
    ['music_studies', 'music', { report: 'hack' }],
    ['skill_assessments', 'assessment', { notes: 'hack' }],
  ]

  it.each(updates)('A não altera %s de B', async (table, key, patch) => {
    const res = await A.client.from(table as 'lessons').update(patch as never).eq('id', b[key]).select()
    expect(res.data ?? []).toEqual([])
    const row = must(await admin.from(table as 'lessons').select('*').eq('id', b[key]).single()) as Record<string, unknown>
    for (const [k, v] of Object.entries(patch)) expect(row[k]).not.toBe(v)
  })

  it('A não altera o perfil de B', async () => {
    const res = await A.client.from('profiles').update({ display_name: 'hack' }).eq('user_id', B.id).select()
    expect(res.data ?? []).toEqual([])
    const row = must(await admin.from('profiles').select('display_name').eq('user_id', B.id).single())
    expect(row.display_name).not.toBe('hack')
  })

  it.each(updates)('A não apaga %s de B', async (table, key) => {
    const res = await A.client.from(table as 'lessons').delete().eq('id', b[key]).select()
    expect(res.data ?? []).toEqual([])
    const still = must(await admin.from(table as 'lessons').select('id').eq('id', b[key]))
    expect(still).toHaveLength(1)
  })

  it('A não insere linha com user_id de B', async () => {
    const res = await A.client.from('lessons').insert({ user_id: B.id, lesson_number: 50 })
    expect(res.error).not.toBeNull()
  })

  it('A não transfere a própria linha para B (update de user_id)', async () => {
    const res = await A.client.from('music_studies').update({ user_id: B.id }).eq('id', a.music).select()
    expect(res.error !== null || (res.data ?? []).length === 0).toBe(true)
    const row = must(await admin.from('music_studies').select('user_id').eq('id', a.music).single())
    expect(row.user_id).toBe(A.id)
  })
})

describe('A não vincula filhos a recursos de B', () => {
  it('study_activities.plan_id → plano de B', async () => {
    const res = await A.client.from('study_activities').insert({
      user_id: A.id, plan_id: b.plan, study_day: '2026-11-10', skill: 'review', title: 'x', planned_minutes: 5,
    })
    expect(res.error).not.toBeNull()
  })

  it('study_sessions.activity_id → atividade de B', async () => {
    const res = await A.client.from('study_sessions').insert({ user_id: A.id, activity_id: b.activity, actual_minutes: 5 })
    expect(res.error).not.toBeNull()
  })

  it('vocabulary_reviews.vocabulary_id → vocabulário de B', async () => {
    const res = await A.client.from('vocabulary_reviews').insert({ user_id: A.id, vocabulary_id: b.vocab, rating: 'easy' })
    expect(res.error).not.toBeNull()
  })

  it('skill_assessments.lesson_id → aula de B', async () => {
    const res = await A.client.from('skill_assessments').insert({
      user_id: A.id, skill: 'reading', assessment_date: '2026-11-10', lesson_id: b.lesson,
    })
    expect(res.error).not.toBeNull()
  })

  it('vocabulary.source_ref → aula de B', async () => {
    const res = await A.client.from('vocabulary').insert({
      user_id: A.id, word: 'x-lesson', translation: 't', example_1: 'e', example_2: 'e', source_type: 'lesson', source_ref: b.lesson,
    })
    expect(res.error).not.toBeNull()
  })

  it('vocabulary.source_ref → estudo musical de B', async () => {
    const res = await A.client.from('vocabulary').insert({
      user_id: A.id, word: 'x-music', translation: 't', example_1: 'e', example_2: 'e', source_type: 'music', source_ref: b.music,
    })
    expect(res.error).not.toBeNull()
  })

  it('UPDATE de filho próprio apontando para recurso de B também é rejeitado', async () => {
    const r1 = await A.client.from('study_sessions').update({ activity_id: b.activity }).eq('id', a.session)
    expect(r1.error).not.toBeNull()
    const r2 = await A.client.from('skill_assessments').update({ lesson_id: b.lesson }).eq('id', a.assessment)
    expect(r2.error).not.toBeNull()
    const r3 = await A.client.from('vocabulary').update({ source_ref: b.lesson }).eq('id', a.vocab)
    expect(r3.error).not.toBeNull()
    const r4 = await A.client.from('study_activities').update({ plan_id: b.plan }).eq('id', a.activity)
    expect(r4.error).not.toBeNull()
  })
})

describe('Integridade de vocabulary.source_ref', () => {
  const base = { translation: 't', example_1: 'e', example_2: 'e' }

  it('aceita referência a aula própria com source_type lesson', async () => {
    const res = await A.client.from('vocabulary').insert({ ...base, user_id: A.id, word: 'ok-lesson', source_type: 'lesson', source_ref: a.lesson })
    expect(res.error).toBeNull()
  })

  it('aceita referência a estudo musical próprio com source_type music', async () => {
    const res = await A.client.from('vocabulary').insert({ ...base, user_id: A.id, word: 'ok-music', source_type: 'music', source_ref: a.music })
    expect(res.error).toBeNull()
  })

  it('rejeita tipo incompatível (lesson apontando para music_study)', async () => {
    const res = await A.client.from('vocabulary').insert({ ...base, user_id: A.id, word: 'bad-type', source_type: 'lesson', source_ref: a.music })
    expect(res.error).not.toBeNull()
  })

  it('rejeita source_ref com source_type manual ou nulo', async () => {
    const r1 = await A.client.from('vocabulary').insert({ ...base, user_id: A.id, word: 'bad-manual', source_type: 'manual', source_ref: a.lesson })
    expect(r1.error).not.toBeNull()
    const r2 = await A.client.from('vocabulary').insert({ ...base, user_id: A.id, word: 'bad-null', source_type: null, source_ref: a.lesson })
    expect(r2.error).not.toBeNull()
  })

  it('rejeita UUID inexistente', async () => {
    const res = await A.client.from('vocabulary').insert({
      ...base, user_id: A.id, word: 'bad-missing', source_type: 'lesson', source_ref: '00000000-0000-4000-8000-0000000000ff',
    })
    expect(res.error).not.toBeNull()
  })
})

describe('ON DELETE SET NULL preserva user_id', () => {
  // Contrato alterado pela ET-002 (§2.2/§5.2): atividade com execução NÃO pode ser excluída.
  // Antes (ET-001) este caso verificava que a exclusão anulava study_sessions.activity_id;
  // agora verifica que a exclusão é rejeitada e que a sessão (e seu user_id) ficam intactos.
  it('apagar atividade com execução é rejeitado; sessão e user_id preservados (ET-002)', async () => {
    const res = await A.client.from('study_activities').delete().eq('id', a.activity).select()
    expect(res.error?.message).toMatch(/execution history/)
    const act = must(await A.client.from('study_activities').select('id').eq('id', a.activity))
    expect(act).toHaveLength(1)
    const row = must(await A.client.from('study_sessions').select('user_id, activity_id').eq('id', a.session).single())
    expect(row.activity_id).toBe(a.activity)
    expect(row.user_id).toBe(A.id)
  })

  it('apagar aula anula skill_assessments.lesson_id e vocabulary.source_ref', async () => {
    must(await A.client.from('lessons').delete().eq('id', a.lesson).select())
    const assessment = must(await A.client.from('skill_assessments').select('user_id, lesson_id').eq('id', a.assessment).single())
    expect(assessment.lesson_id).toBeNull()
    expect(assessment.user_id).toBe(A.id)
    const vocab = must(await A.client.from('vocabulary').select('user_id, source_type, source_ref').eq('id', a.vocab).single())
    expect(vocab.source_ref).toBeNull()
    expect(vocab.source_type).toBe('lesson')
    expect(vocab.user_id).toBe(A.id)
  })

  it('os dados de B permanecem intactos', async () => {
    for (const [table, key] of [
      ['study_activities', 'activity'],
      ['lessons', 'lesson'],
      ['study_sessions', 'session'],
    ] as const) {
      const rows = must(await admin.from(table as 'lessons').select('id').eq('id', b[key]))
      expect(rows).toHaveLength(1)
    }
  })
})
