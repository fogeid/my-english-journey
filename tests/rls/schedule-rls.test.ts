/**
 * ET-002 — cronograma: RLS, integridade, idempotência e concorrência (itens 14–20 da ET).
 * Roda SOMENTE contra o Supabase local. Contas fictícias criadas e removidas pelo próprio teste.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'
import { createSupabaseScheduleService, SCHEDULE_MESSAGES } from '../../src/features/schedule/schedule-service'
import { addDays, currentWeekStart } from '../../src/features/schedule/week'
import { getLocalSupabaseEnv, runLocalSql } from './local-env'
import { deleteLocalTestAccount } from './test-accounts'

type Client = SupabaseClient<Database>

const env = getLocalSupabaseEnv()
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin: Client = createClient<Database>(env.url, env.serviceRoleKey, opts)
const anon: Client = createClient<Database>(env.url, env.anonKey, opts)

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const PASSWORD = `Sched-Test-${runId}!`
const accounts: string[] = []

interface Account {
  id: string
  client: Client
}

async function createAccount(tag: string): Promise<Account> {
  const email = `sched-${tag}-${runId}@example.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw error ?? new Error('createUser falhou')
  accounts.push(data.user.id)
  const client = createClient<Database>(env.url, env.anonKey, opts)
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signIn.error) throw signIn.error
  const profile = await client.rpc('create_my_profile')
  if (profile.error) throw profile.error
  return { id: data.user.id, client }
}

function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error
  if (res.data === null || res.data === undefined) throw new Error('sem dados')
  return res.data as NonNullable<T>
}

const WEEK = currentWeekStart()
const PREV_WEEK = addDays(WEEK, -7)
const NEXT_WEEK = addDays(WEEK, 7)

let A: Account
let B: Account
const b = {} as { plan: string; activity: string; activity2: string; session: string }

async function activitiesOf(c: Client, planId: string) {
  return must(await c.from('study_activities').select('*').eq('plan_id', planId).order('study_day').order('position'))
}

beforeAll(async () => {
  A = await createAccount('a')
  B = await createAccount('b')
  const plan = must(await B.client.rpc('create_initial_plan'))
  b.plan = plan.id
  const acts = await activitiesOf(B.client, plan.id)
  b.activity = acts[0].id
  b.activity2 = acts[1].id
  b.session = must(await B.client.rpc('complete_activity', { p_activity_id: b.activity, p_actual_minutes: 12 })).id
})

afterAll(async () => {
  for (const id of accounts) await deleteLocalTestAccount(admin, id)
})

describe('Esquema efetivo da ET-002 (catálogo)', () => {
  it('migração incremental registrada após a da ET-001', () => {
    // Migrações posteriores (ET-003+) podem vir depois; ET-001 e ET-002 devem estar presentes e em ordem.
    const versions = runLocalSql('select version from supabase_migrations.schema_migrations order by 1')
    expect(versions.slice(0, 2)).toEqual(['202611090001', '202611100001'])
  })

  it('RLS segue habilitado e as 12 policies do cronograma são as da ET-001, todas TO authenticated', () => {
    expect(
      runLocalSql(`select relname || ':' || relrowsecurity from pg_class where relname in ('study_plans','study_activities','study_sessions') order by 1`),
    ).toEqual(['study_activities:true', 'study_plans:true', 'study_sessions:true'])
    const policies = runLocalSql(
      `select policyname || ':' || array_to_string(roles, ',') from pg_policies where tablename like 'study_%' order by 1`,
    )
    expect(policies).toHaveLength(12)
    expect(policies.every((p) => p.endsWith(':authenticated'))).toBe(true)
  })

  it('novas funções: SECURITY INVOKER, search_path fixo, EXECUTE só para authenticated', () => {
    const fns = ['create_initial_plan()', 'complete_activity(uuid,integer)', 'reopen_activity(uuid)', 'reorder_day_activities(uuid,date,uuid[])', 'get_week_summary(date)']
    for (const fn of fns) {
      const [row] = runLocalSql(
        `select p.prosecdef || ':' || array_to_string(p.proconfig, ',') || ':' ||
                has_function_privilege('anon', p.oid, 'execute') || ':' || has_function_privilege('authenticated', p.oid, 'execute') || ':' ||
                coalesce((select bool_or(a::text like '=%') from unnest(p.proacl) a), false)
           from pg_proc p where p.oid = 'public.${fn}'::regprocedure`,
      )
      expect(row, fn).toBe('false:search_path="":false:true:false')
    }
  })

  it('nenhuma função SECURITY DEFINER nova (somente as 4 da ET-001)', () => {
    expect(runLocalSql(`select proname from pg_proc where pronamespace = 'public'::regnamespace and prosecdef order by 1`)).toEqual([
      'check_vocabulary_source_ref',
      'clear_vocabulary_source_ref',
      'create_my_profile',
      'prevent_source_owner_change',
    ])
  })

  it('grants: anon sem privilégios; authenticated sem TRUNCATE/TRIGGER/REFERENCES e sem DELETE em sessões', () => {
    const rows = runLocalSql(
      `select table_name || ':' || grantee || ':' || string_agg(privilege_type, ',' order by privilege_type)
         from information_schema.role_table_grants
        where table_schema = 'public' and table_name like 'study_%' and grantee in ('anon','authenticated')
        group by table_name, grantee order by 1`,
    )
    expect(rows).toEqual([
      'study_activities:authenticated:DELETE,INSERT,SELECT,UPDATE',
      'study_plans:authenticated:DELETE,INSERT,SELECT,UPDATE',
      'study_sessions:authenticated:INSERT,SELECT,UPDATE',
    ])
  })

  it('unicidade: plano por semana (ET-001) e execução por atividade (ET-002)', () => {
    const idx = runLocalSql(
      `select indexrelid::regclass::text || ':' || indisunique from pg_index
        where indexrelid::regclass::text in ('study_plans_user_id_week_start_key','study_sessions_one_per_activity') order by 1`,
    )
    expect(idx).toEqual(['study_plans_user_id_week_start_key:true', 'study_sessions_one_per_activity:true'])
  })
})

describe('Plano inicial (ação explícita, idempotente)', () => {
  it('cria exatamente 5 atividades na segunda da semana atual (60 min), nada nos demais dias', async () => {
    const plan = must(await B.client.from('study_plans').select('*').eq('id', b.plan).single())
    expect(plan.week_start).toBe(WEEK)
    const acts = await activitiesOf(B.client, b.plan)
    expect(acts).toHaveLength(5)
    expect(acts.every((a) => a.study_day === WEEK)).toBe(true)
    expect(acts.map((a) => [a.position, a.skill, a.planned_minutes])).toEqual([
      [1, 'grammar', 15],
      [2, 'vocabulary', 10],
      [3, 'listening', 15],
      [4, 'speaking', 10],
      [5, 'review', 10],
    ])
    expect(acts.reduce((n, a) => n + a.planned_minutes, 0)).toBe(60)
    expect(acts[0].title).toBe('Apresentando-se — Gramática')
  })

  it('17. chamadas concorrentes não duplicam plano nem atividades', async () => {
    const C = await createAccount('c')
    const results = await Promise.all(Array.from({ length: 6 }, () => C.client.rpc('create_initial_plan')))
    for (const r of results) expect(r.error).toBeNull()
    expect(new Set(results.map((r) => r.data!.id)).size).toBe(1)
    const plans = must(await admin.from('study_plans').select('id').eq('user_id', C.id))
    expect(plans).toHaveLength(1)
    const acts = must(await admin.from('study_activities').select('id').eq('user_id', C.id))
    expect(acts).toHaveLength(5)
  })

  it('não altera plano já existente (nem um plano vazio criado antes)', async () => {
    const D = await createAccount('d')
    must(await D.client.from('study_plans').insert({ user_id: D.id, week_start: WEEK, title: 'meu plano' }).select())
    const plan = must(await D.client.rpc('create_initial_plan'))
    expect(plan.title).toBe('meu plano')
    expect(must(await D.client.from('study_activities').select('id').eq('user_id', D.id))).toHaveLength(0)
  })
})

describe('14. Usuário A não acessa o cronograma de B', () => {
  it.each(['study_plans', 'study_activities', 'study_sessions'] as const)('A não lê %s de B', async (table) => {
    const res = await A.client.from(table).select('user_id').eq('user_id', B.id)
    expect(res.error).toBeNull()
    expect(res.data).toEqual([])
    const ofB = await admin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', B.id)
    expect(ofB.count).toBeGreaterThan(0)
  })

  it('A não insere plano/atividade/sessão em nome de B', async () => {
    const p = await A.client.from('study_plans').insert({ user_id: B.id, week_start: NEXT_WEEK, title: 'x' })
    expect(p.error?.code).toBe('42501')
    const a = await A.client.from('study_activities').insert({
      user_id: B.id, plan_id: b.plan, study_day: WEEK, skill: 'other', title: 'x', planned_minutes: 5,
    })
    expect(a.error).not.toBeNull()
    const s = await A.client.from('study_sessions').insert({ user_id: B.id, activity_id: b.activity2, actual_minutes: 1 })
    expect(s.error).not.toBeNull()
  })

  it('A não edita nem apaga plano/atividade/sessão de B', async () => {
    expect((await A.client.from('study_plans').update({ title: 'hack' }).eq('id', b.plan).select()).data ?? []).toEqual([])
    expect((await A.client.from('study_activities').update({ title: 'hack' }).eq('id', b.activity).select()).data ?? []).toEqual([])
    expect((await A.client.from('study_sessions').update({ actual_minutes: 400 }).eq('id', b.session).select()).data ?? []).toEqual([])
    expect((await A.client.from('study_activities').delete().eq('id', b.activity2).select()).data ?? []).toEqual([])
    expect((await A.client.from('study_plans').delete().eq('id', b.plan).select()).data ?? []).toEqual([])

    const plan = must(await admin.from('study_plans').select('title').eq('id', b.plan).single())
    expect(plan.title).not.toBe('hack')
    expect(must(await admin.from('study_activities').select('id').eq('plan_id', b.plan))).toHaveLength(5)
    const ses = must(await admin.from('study_sessions').select('actual_minutes').eq('id', b.session).single())
    expect(ses.actual_minutes).toBe(12)
  })

  it('funções não permitem manipular dados de B', async () => {
    const c = await A.client.rpc('complete_activity', { p_activity_id: b.activity2, p_actual_minutes: 5 })
    expect(c.error?.message).toMatch(/activity not found/)
    const r = await A.client.rpc('reopen_activity', { p_activity_id: b.activity })
    expect(r.error?.message).toMatch(/no execution to reopen/)
    const o = await A.client.rpc('reorder_day_activities', { p_plan_id: b.plan, p_study_day: WEEK, p_ids: [b.activity2, b.activity] })
    expect(o.error?.message).toMatch(/plan not found/)
    const sum = must(await A.client.rpc('get_week_summary', { p_week_start: WEEK }))
    expect(sum[0]).toEqual({ has_plan: false, planned_count: 0, planned_minutes: 0, completed_count: 0, completed_minutes: 0 })

    expect(must(await admin.from('study_sessions').select('id').eq('activity_id', b.activity2))).toHaveLength(0)
    const s = must(await admin.from('study_sessions').select('is_completed').eq('id', b.session).single())
    expect(s.is_completed).toBe(true)
  })
})

describe('15. A não vincula registros ao cronograma de B (INSERT e UPDATE)', () => {
  let aPlan: string
  let aActivity: string
  let aSession: string

  beforeAll(async () => {
    aPlan = must(await A.client.from('study_plans').insert({ user_id: A.id, week_start: PREV_WEEK, title: 'A' }).select('id').single()).id
    aActivity = must(
      await A.client
        .from('study_activities')
        .insert({ user_id: A.id, plan_id: aPlan, study_day: PREV_WEEK, skill: 'other', title: 'a1', planned_minutes: 5 })
        .select('id')
        .single(),
    ).id
    aSession = must(await A.client.rpc('complete_activity', { p_activity_id: aActivity, p_actual_minutes: 3 })).id
  })

  it('INSERT de atividade no plano de B → FK composta activities_owner_plan_fk', async () => {
    const res = await A.client.from('study_activities').insert({
      user_id: A.id, plan_id: b.plan, study_day: WEEK, skill: 'other', title: 'x', planned_minutes: 5,
    })
    expect(res.error?.code).toBe('23503')
    expect(res.error?.message).toMatch(/activities_owner_plan_fk/)
  })

  it('INSERT de sessão na atividade de B → FK composta sessions_owner_activity_fk', async () => {
    const res = await A.client.from('study_sessions').insert({ user_id: A.id, activity_id: b.activity2, actual_minutes: 1 })
    expect(res.error?.code).toBe('23503')
    expect(res.error?.message).toMatch(/sessions_owner_activity_fk/)
  })

  it('UPDATE da própria atividade para o plano de B → rejeitado (plano imutável)', async () => {
    const res = await A.client.from('study_activities').update({ plan_id: b.plan }).eq('id', aActivity)
    expect(res.error).not.toBeNull()
    expect(must(await admin.from('study_activities').select('plan_id').eq('id', aActivity).single()).plan_id).toBe(aPlan)
  })

  it('UPDATE da própria sessão para a atividade de B → rejeitado (atividade imutável)', async () => {
    const res = await A.client.from('study_sessions').update({ activity_id: b.activity2 }).eq('id', aSession)
    expect(res.error).not.toBeNull()
    expect(must(await admin.from('study_sessions').select('activity_id').eq('id', aSession).single()).activity_id).toBe(aActivity)
  })

  it('UPDATE de user_id para B → rejeitado em plano, atividade e sessão', async () => {
    for (const [table, id] of [
      ['study_plans', aPlan],
      ['study_activities', aActivity],
      ['study_sessions', aSession],
    ] as const) {
      const res = await A.client.from(table).update({ user_id: B.id }).eq('id', id).select()
      expect(res.error !== null || (res.data ?? []).length === 0, table).toBe(true)
      expect(must(await admin.from(table).select('user_id').eq('id', id).single()).user_id).toBe(A.id)
    }
  })
})

describe('16. Anônimo', () => {
  it.each(['study_plans', 'study_activities', 'study_sessions'] as const)('não acessa %s', async (table) => {
    const res = await anon.from(table).select('*')
    expect(res.error?.code).toBe('42501')
    const ins = await anon.from(table).insert({} as never)
    expect(ins.error).not.toBeNull()
  })

  it('não executa as funções do cronograma', async () => {
    const calls = [
      anon.rpc('create_initial_plan'),
      anon.rpc('complete_activity', { p_activity_id: b.activity2, p_actual_minutes: 1 }),
      anon.rpc('reopen_activity', { p_activity_id: b.activity }),
      anon.rpc('reorder_day_activities', { p_plan_id: b.plan, p_study_day: WEEK, p_ids: [b.activity] }),
      anon.rpc('get_week_summary', { p_week_start: WEEK }),
    ]
    for (const res of await Promise.all(calls)) {
      expect(res.error?.message).toMatch(/permission denied/)
    }
  })

  it('funções chamadas sem usuário (service_role, uid nulo) recusam', async () => {
    const res = await admin.rpc('create_initial_plan')
    expect(res.error?.message).toMatch(/not authenticated/)
  })
})

describe('18/20. Conclusão e reabertura: idempotência, concorrência e consistência', () => {
  let actId: string
  let planId: string

  beforeAll(async () => {
    planId = must(await A.client.from('study_plans').insert({ user_id: A.id, week_start: WEEK, title: 'A atual' }).select('id').single()).id
    actId = must(
      await A.client
        .from('study_activities')
        .insert({ user_id: A.id, plan_id: planId, study_day: addDays(WEEK, 2), skill: 'speaking', title: 'conc', planned_minutes: 30 })
        .select('id')
        .single(),
    ).id
  })

  it('18. conclusões concorrentes e repetidas geram uma única execução', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => A.client.rpc('complete_activity', { p_activity_id: actId, p_actual_minutes: 20 + i })),
    )
    for (const r of results) expect(r.error).toBeNull()
    must(await A.client.rpc('complete_activity', { p_activity_id: actId, p_actual_minutes: 25 }))
    const rows = must(await admin.from('study_sessions').select('*').eq('activity_id', actId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ user_id: A.id, actual_minutes: 25, is_completed: true })
  })

  it('INSERT direto de segunda sessão para a mesma atividade é rejeitado (unicidade)', async () => {
    const res = await A.client.from('study_sessions').insert({ user_id: A.id, activity_id: actId, actual_minutes: 1 })
    expect(res.error?.code).toBe('23505')
  })

  it('20. reabrir preserva minutos e completed_at; deixa de contar; concluir de novo atualiza o mesmo registro', async () => {
    const before = must(await admin.from('study_sessions').select('*').eq('activity_id', actId).single())
    const sum1 = must(await A.client.rpc('get_week_summary', { p_week_start: WEEK }))[0]
    expect(sum1).toMatchObject({ completed_count: 1, completed_minutes: 25 })

    const reopened = must(await A.client.rpc('reopen_activity', { p_activity_id: actId }))
    expect(reopened).toMatchObject({ id: before.id, user_id: A.id, is_completed: false, actual_minutes: 25, completed_at: before.completed_at })
    expect(reopened.reopened_at).not.toBeNull()
    // Reabrir de novo é idempotente (não muda reopened_at).
    const again = must(await A.client.rpc('reopen_activity', { p_activity_id: actId }))
    expect(again.reopened_at).toBe(reopened.reopened_at)

    const sum2 = must(await A.client.rpc('get_week_summary', { p_week_start: WEEK }))[0]
    expect(sum2).toMatchObject({ completed_count: 0, completed_minutes: 0, planned_count: 1 })

    const recompleted = must(await A.client.rpc('complete_activity', { p_activity_id: actId, p_actual_minutes: 7 }))
    expect(recompleted).toMatchObject({ id: before.id, user_id: A.id, is_completed: true, actual_minutes: 7, reopened_at: reopened.reopened_at })
    expect(new Date(recompleted.completed_at).getTime()).toBeGreaterThan(new Date(before.completed_at).getTime())
    expect(must(await admin.from('study_sessions').select('id').eq('activity_id', actId))).toHaveLength(1)
  })

  it('minutos fora de 0–480 são rejeitados (RPC e constraint); 0 é aceito', async () => {
    const bad = await A.client.rpc('complete_activity', { p_activity_id: actId, p_actual_minutes: 481 })
    expect(bad.error?.code).toBe('22023')
    const neg = await A.client.rpc('complete_activity', { p_activity_id: actId, p_actual_minutes: -1 })
    expect(neg.error?.code).toBe('22023')
    const direct = await A.client.from('study_sessions').update({ actual_minutes: 481 }).eq('activity_id', actId)
    expect(direct.error?.code).toBe('23514')
    const zero = must(await A.client.rpc('complete_activity', { p_activity_id: actId, p_actual_minutes: 0 }))
    expect(zero.actual_minutes).toBe(0)
  })

  it('12/20. agregação pela semana PLANEJADA, não pela data de conclusão', async () => {
    // Atividade planejada na semana passada, concluída agora.
    const past = must(await A.client.from('study_plans').select('id').eq('week_start', PREV_WEEK).single())
    const pastAct = must(
      await A.client
        .from('study_activities')
        .insert({ user_id: A.id, plan_id: past.id, study_day: addDays(PREV_WEEK, 6), skill: 'review', title: 'tarde', planned_minutes: 10 })
        .select('id')
        .single(),
    ).id
    must(await A.client.rpc('complete_activity', { p_activity_id: pastAct, p_actual_minutes: 11 }))
    const prev = must(await A.client.rpc('get_week_summary', { p_week_start: PREV_WEEK }))[0]
    const cur = must(await A.client.rpc('get_week_summary', { p_week_start: WEEK }))[0]
    expect(prev).toMatchObject({ has_plan: true, planned_count: 2, completed_count: 2, completed_minutes: 14 })
    expect(cur).toMatchObject({ planned_count: 1, completed_count: 1, completed_minutes: 0 })
  })
})

describe('19. Exclusão com histórico é rejeitada sem perda', () => {
  it('atividade concluída: DELETE rejeitado, sessão intacta', async () => {
    const res = await B.client.from('study_activities').delete().eq('id', b.activity).select()
    expect(res.error?.code).toBe('23503')
    expect(res.error?.message).toMatch(/execution history/)
    expect(must(await admin.from('study_sessions').select('*').eq('id', b.session).single())).toMatchObject({ activity_id: b.activity, actual_minutes: 12 })
  })

  it('atividade reaberta também mantém o bloqueio', async () => {
    must(await B.client.rpc('reopen_activity', { p_activity_id: b.activity }))
    const res = await B.client.from('study_activities').delete().eq('id', b.activity).select()
    expect(res.error?.message).toMatch(/execution history/)
    must(await B.client.rpc('complete_activity', { p_activity_id: b.activity, p_actual_minutes: 12 }))
  })

  it('excluir o plano (cascata) também é bloqueado e nada é apagado', async () => {
    const res = await B.client.from('study_plans').delete().eq('id', b.plan).select()
    expect(res.error?.message).toMatch(/execution history/)
    expect(must(await admin.from('study_plans').select('id').eq('id', b.plan))).toHaveLength(1)
    expect(must(await admin.from('study_activities').select('id').eq('plan_id', b.plan))).toHaveLength(5)
    expect(must(await admin.from('study_sessions').select('id').eq('id', b.session))).toHaveLength(1)
  })

  it('o cliente não apaga execuções diretamente (DELETE revogado)', async () => {
    const res = await B.client.from('study_sessions').delete().eq('id', b.session).select()
    expect(res.error?.code).toBe('42501')
    expect(must(await admin.from('study_sessions').select('id').eq('id', b.session))).toHaveLength(1)
  })

  it('atividade sem execução pode ser excluída', async () => {
    const extra = must(
      await B.client
        .from('study_activities')
        .insert({ user_id: B.id, plan_id: b.plan, study_day: addDays(WEEK, 3), skill: 'other', title: 'temp', planned_minutes: 5 })
        .select('id')
        .single(),
    ).id
    const res = must(await B.client.from('study_activities').delete().eq('id', extra).select())
    expect(res).toHaveLength(1)
  })
})

describe('Regras de atividade no banco', () => {
  let planId: string
  beforeAll(async () => {
    planId = must(await A.client.from('study_plans').insert({ user_id: A.id, week_start: NEXT_WEEK, title: 'regras' }).select('id').single()).id
  })
  const base = () => ({ user_id: A.id, plan_id: planId, study_day: NEXT_WEEK, skill: 'other', title: 'ok', planned_minutes: 10 })

  it('week_start precisa ser segunda-feira; um plano por semana', async () => {
    const tue = await A.client.from('study_plans').insert({ user_id: A.id, week_start: addDays(NEXT_WEEK, 8), title: 'x' })
    expect(tue.error?.code).toBe('23514')
    const dup = await A.client.from('study_plans').insert({ user_id: A.id, week_start: NEXT_WEEK, title: 'dup' })
    expect(dup.error?.code).toBe('23505')
  })

  it('dia fora da semana, minutos, título, descrição e categoria inválidos são rejeitados', async () => {
    const cases = [
      { study_day: addDays(NEXT_WEEK, 7) },
      { study_day: addDays(NEXT_WEEK, -1) },
      { planned_minutes: 0 },
      { planned_minutes: 241 },
      { title: '   ' },
      { title: 'x'.repeat(121) },
      { description: 'x'.repeat(2001) },
      { skill: 'flashcards' },
    ]
    for (const patch of cases) {
      const res = await A.client.from('study_activities').insert({ ...base(), ...patch })
      expect(res.error?.code, JSON.stringify(patch).slice(0, 60)).toBe('23514')
    }
  })

  it('categorias do MVP aceitas; writing aceita no banco por compatibilidade', async () => {
    for (const skill of ['grammar', 'vocabulary', 'listening', 'speaking', 'review', 'other', 'writing']) {
      const res = await A.client.from('study_activities').insert({ ...base(), study_day: addDays(NEXT_WEEK, 1), skill, title: skill })
      expect(res.error, skill).toBeNull()
    }
  })

  it('posição automática no fim do dia, reordenação atômica e mover de dia', async () => {
    const day = addDays(NEXT_WEEK, 4)
    const ids: string[] = []
    for (const t of ['p1', 'p2', 'p3']) {
      ids.push(must(await A.client.from('study_activities').insert({ ...base(), study_day: day, title: t }).select('id, position').single()).id)
    }
    const order = async () =>
      must(await A.client.from('study_activities').select('title, position').eq('plan_id', planId).eq('study_day', day).order('position')).map((r) => r.title)
    expect(await order()).toEqual(['p1', 'p2', 'p3'])

    const reordered = await A.client.rpc('reorder_day_activities', { p_plan_id: planId, p_study_day: day, p_ids: [ids[2], ids[0], ids[1]] })
    expect(reordered.error).toBeNull()
    expect(await order()).toEqual(['p3', 'p1', 'p2'])

    // ids incompletos ou de outro dia são rejeitados
    const partial = await A.client.rpc('reorder_day_activities', { p_plan_id: planId, p_study_day: day, p_ids: [ids[0], ids[1]] })
    expect(partial.error?.code).toBe('22023')

    // mover p1 para outro dia da mesma semana: vai para o fim daquele dia
    const target = addDays(NEXT_WEEK, 5)
    must(await A.client.from('study_activities').insert({ ...base(), study_day: target, title: 'q1' }).select())
    const moved = must(await A.client.from('study_activities').update({ study_day: target }).eq('id', ids[0]).select('study_day, position').single())
    expect(moved).toEqual({ study_day: target, position: 2 })
  })

  it('máximo de 30 atividades por dia', async () => {
    const day = addDays(NEXT_WEEK, 6)
    const rows = Array.from({ length: 30 }, (_, i) => ({ ...base(), study_day: day, title: `l${i}` }))
    for (const row of rows) expect((await A.client.from('study_activities').insert(row)).error).toBeNull()
    const over = await A.client.from('study_activities').insert({ ...base(), study_day: day, title: 'l30' })
    expect(over.error?.message).toMatch(/more than 30 activities/)
  })
})

describe('schedule-service real contra o banco local', () => {
  it('fluxo completo e mensagens de erro do serviço', async () => {
    const E = await createAccount('e')
    const svc = createSupabaseScheduleService(E.client)

    let week = await svc.loadWeek(NEXT_WEEK)
    expect(week.plan).toBeNull()
    expect(week.summary).toEqual({ has_plan: false, planned_count: 0, planned_minutes: 0, completed_count: 0, completed_minutes: 0 })

    await svc.createEmptyPlan(E.id, NEXT_WEEK)
    await svc.createEmptyPlan(E.id, NEXT_WEEK) // idempotente
    week = await svc.loadWeek(NEXT_WEEK)
    expect(week.plan).not.toBeNull()
    const planId = week.plan!.id

    await svc.createActivity(E.id, planId, { title: 'um', description: null, skill: 'grammar', plannedMinutes: 10, studyDay: NEXT_WEEK })
    await svc.createActivity(E.id, planId, { title: 'dois', description: 'd', skill: 'other', plannedMinutes: 20, studyDay: NEXT_WEEK })
    week = await svc.loadWeek(NEXT_WEEK)
    const [one, two] = week.activities
    expect([one.title, two.title]).toEqual(['um', 'dois'])

    await svc.reorderDay(planId, NEXT_WEEK, [two.id, one.id])
    await svc.updateActivity(one.id, { title: 'um!', description: null, skill: 'grammar', plannedMinutes: 15, studyDay: addDays(NEXT_WEEK, 1) })
    await svc.completeActivity(two.id, 18)
    week = await svc.loadWeek(NEXT_WEEK)
    expect(week.activities.map((a) => [a.title, a.study_day])).toEqual([
      ['dois', NEXT_WEEK],
      ['um!', addDays(NEXT_WEEK, 1)],
    ])
    expect(week.sessions[two.id]).toMatchObject({ is_completed: true, actual_minutes: 18 })
    expect(week.summary).toMatchObject({ has_plan: true, planned_count: 2, planned_minutes: 35, completed_count: 1, completed_minutes: 18 })

    await svc.reopenActivity(two.id)
    expect((await svc.getWeekSummary(NEXT_WEEK)).completed_count).toBe(0)

    await expect(svc.deleteActivity(two.id)).rejects.toMatchObject({ userMessage: SCHEDULE_MESSAGES.history })
    await svc.deleteActivity(one.id)
    await expect(svc.updateActivity(two.id, { title: 'x', description: null, skill: 'other', plannedMinutes: 5, studyDay: addDays(NEXT_WEEK, 9) })).rejects.toMatchObject({
      userMessage: SCHEDULE_MESSAGES.invalid,
    })
    expect((await svc.loadWeek(NEXT_WEEK)).activities).toHaveLength(1)
  })
})
