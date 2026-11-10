/**
 * ET-007 — subatividades e gerador: RLS, integridade, sincronização com a atividade principal,
 * atomicidade e idempotência. Roda SOMENTE contra o Supabase local (contas fictícias do próprio teste).
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
const PASSWORD = `Steps-Test-${runId}!`
const accounts: string[] = []

interface Account {
  id: string
  client: Client
}

async function createAccount(tag: string): Promise<Account> {
  const email = `steps-${tag}-${runId}@example.test`
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
const DAY = addDays(WEEK, 1)
const STEPS = [
  { title: 'Revisão', description: null, planned_minutes: 10 },
  { title: 'Gramática', description: 'to be', planned_minutes: 15 },
  { title: 'Speaking', description: null, planned_minutes: 5 },
]

let A: Account
let B: Account
let bPlan = ''

async function plan(c: Client, week = WEEK) {
  const { data } = await c.from('study_plans').select('id').eq('week_start', week).maybeSingle()
  if (data) return data.id
  const { data: u } = await c.auth.getUser()
  return must(await c.from('study_plans').insert({ user_id: u.user!.id, week_start: week, title: 'Plano de teste' }).select('id').single()).id
}

async function save(c: Client, planId: string, steps: unknown[] = STEPS, activityId: string | null = null, title = 'Aula 04') {
  return must(
    await c.rpc('save_activity', {
      p_activity_id: activityId as string,
      p_plan_id: planId,
      p_study_day: DAY,
      p_skill: 'lesson',
      p_title: title,
      p_description: '',
      p_planned_minutes: 1,
      p_steps: steps as never,
    }),
  )
}

const stepsOf = async (c: Client, activityId: string) =>
  must(await c.from('study_subactivities').select('*').eq('activity_id', activityId).order('position'))
const sessionOf = async (c: Client, activityId: string) =>
  (await c.from('study_sessions').select('*').eq('activity_id', activityId).maybeSingle()).data

beforeAll(async () => {
  A = await createAccount('a')
  B = await createAccount('b')
  bPlan = await plan(B.client)
})

afterAll(async () => {
  for (const id of accounts) await deleteLocalTestAccount(admin, id)
})

describe('Catálogo da ET-007', () => {
  it('migração 202611100005 registrada; tabela com RLS, FK composta, checks e índice único do gerador', () => {
    expect(runLocalSql(`select version from supabase_migrations.schema_migrations where version = '202611100005'`)).toEqual(['202611100005'])
    expect(runLocalSql(`select relrowsecurity::text from pg_class where relname = 'study_subactivities'`)).toEqual(['true'])
    const cons = runLocalSql(
      `select conname from pg_constraint where conrelid = 'public.study_subactivities'::regclass order by 1`,
    )
    expect(cons).toContain('study_subactivities_owner_activity_fk')
    expect(runLocalSql(`select pg_get_constraintdef(oid) from pg_constraint where conname = 'study_subactivities_owner_activity_fk'`)[0]).toMatch(
      /FOREIGN KEY \(user_id, activity_id\) REFERENCES study_activities\(user_id, id\) ON DELETE CASCADE/,
    )
    expect(runLocalSql(`select indexdef from pg_indexes where indexname = 'study_activities_generator_key_idx'`)[0]).toMatch(
      /UNIQUE INDEX .*\(user_id, generator_key\) WHERE \(generator_key IS NOT NULL\)/,
    )
  })

  it('funções novas: SECURITY INVOKER, search_path vazio, EXECUTE só para authenticated', () => {
    const rows = runLocalSql(
      `select p.proname || ':' || p.prosecdef || ':' || coalesce(array_to_string(p.proconfig, ','), '') || ':' ||
              has_function_privilege('anon', p.oid, 'execute') || ':' || has_function_privilege('authenticated', p.oid, 'execute')
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in
          ('schedule_write_steps','save_activity','set_subactivity_completed','generate_schedule','complete_activity','reopen_activity')
        order by 1`,
    )
    expect(rows).toEqual(
      ['complete_activity', 'generate_schedule', 'reopen_activity', 'save_activity', 'schedule_write_steps', 'set_subactivity_completed'].map(
        (n) => `${n}:false:search_path="":false:true`,
      ),
    )
  })

  it('anon não executa as RPCs nem lê etapas', async () => {
    const r = await anon.rpc('generate_schedule', { p_items: [] as never })
    expect(r.error).not.toBeNull()
    const s = await anon.from('study_subactivities').select('id')
    expect(s.error ?? (s.data ?? []).length).toBeTruthy()
  })
})

describe('save_activity — criação/edição atômica com etapas', () => {
  it('cria atividade com etapas: planned = soma, posições 1..n, nada concluído', async () => {
    const act = await save(A.client, await plan(A.client))
    expect(act.planned_minutes).toBe(30)
    const steps = await stepsOf(A.client, act.id)
    expect(steps.map((s) => [s.position, s.title, s.planned_minutes, s.is_completed])).toEqual([
      [1, 'Revisão', 10, false],
      [2, 'Gramática', 15, false],
      [3, 'Speaking', 5, false],
    ])
    expect(await sessionOf(A.client, act.id)).toBeNull()
  })

  it('edição: reordena por id, atualiza, insere e remove etapas; soma recalculada', async () => {
    const act = await save(A.client, await plan(A.client), STEPS, null, 'Editar etapas')
    const [s1, s2, s3] = await stepsOf(A.client, act.id)
    const edited = await save(
      A.client,
      await plan(A.client),
      [
        { id: s2.id, title: 'Gramática 2', description: null, planned_minutes: 20 },
        { id: s1.id, title: s1.title, description: null, planned_minutes: 10 },
        { title: 'Nova', description: 'x', planned_minutes: 7 },
      ],
      act.id,
      'Editar etapas',
    )
    expect(edited.planned_minutes).toBe(37)
    const after = await stepsOf(A.client, act.id)
    expect(after.map((s) => [s.position, s.title])).toEqual([
      [1, 'Gramática 2'],
      [2, 'Revisão'],
      [3, 'Nova'],
    ])
    expect(after[0].id).toBe(s2.id)
    expect(after.some((s) => s.id === s3.id)).toBe(false)
  })

  it('soma > 240, etapa inválida ou mais de 20 etapas: erro e NADA gravado (rollback)', async () => {
    const p = await plan(A.client)
    const before = must(await A.client.from('study_activities').select('id')).length
    const tooLong = await A.client.rpc('save_activity', {
      p_activity_id: null as never, p_plan_id: p, p_study_day: DAY, p_skill: 'lesson', p_title: 'Longa', p_description: '',
      p_planned_minutes: 1, p_steps: [{ title: 'a', planned_minutes: 200 }, { title: 'b', planned_minutes: 41 }] as never,
    })
    expect(tooLong.error).not.toBeNull()
    const bad = await A.client.rpc('save_activity', {
      p_activity_id: null as never, p_plan_id: p, p_study_day: DAY, p_skill: 'lesson', p_title: 'Inválida', p_description: '',
      p_planned_minutes: 1, p_steps: [{ title: '', planned_minutes: 5 }] as never,
    })
    expect(bad.error).not.toBeNull()
    const many = await A.client.rpc('save_activity', {
      p_activity_id: null as never, p_plan_id: p, p_study_day: DAY, p_skill: 'lesson', p_title: 'Muitas', p_description: '',
      p_planned_minutes: 1, p_steps: Array.from({ length: 21 }, (_, i) => ({ title: `e${i}`, planned_minutes: 1 })) as never,
    })
    expect(many.error).not.toBeNull()
    expect(must(await A.client.from('study_activities').select('id')).length).toBe(before)
  })

  it('sem etapas: comportamento antigo (minutos informados)', async () => {
    const act = await save(A.client, await plan(A.client), [], null, 'Simples')
    expect(act.planned_minutes).toBe(1)
    expect(await stepsOf(A.client, act.id)).toHaveLength(0)
  })

  it('serviço mapeia a soma acima do limite para mensagem amigável', async () => {
    const service = createSupabaseScheduleService(A.client)
    await expect(
      service.saveActivity({
        activityId: null,
        planId: await plan(A.client),
        values: { title: 'Longa', description: null, skill: 'lesson', plannedMinutes: 1, studyDay: DAY },
        steps: [{ title: 'a', description: null, planned_minutes: 200 }, { title: 'b', description: null, planned_minutes: 41 }],
      }),
    ).rejects.toMatchObject({ userMessage: expect.any(String) })
  })
})

describe('Sincronização etapa ↔ atividade principal', () => {
  it('marcar etapas; a última exige minutos reais e conclui a principal', async () => {
    const act = await save(A.client, await plan(A.client), STEPS, null, 'Sync 1')
    const [s1, s2, s3] = await stepsOf(A.client, act.id)
    expect(must(await A.client.rpc('set_subactivity_completed', { p_subactivity_id: s1.id, p_completed: true }))).toMatchObject({
      done: 1, total: 3, activity_completed: false,
    })
    // idempotente
    must(await A.client.rpc('set_subactivity_completed', { p_subactivity_id: s1.id, p_completed: true }))
    must(await A.client.rpc('set_subactivity_completed', { p_subactivity_id: s2.id, p_completed: true }))
    expect(await sessionOf(A.client, act.id)).toBeNull()

    const noMinutes = await A.client.rpc('set_subactivity_completed', { p_subactivity_id: s3.id, p_completed: true })
    expect(noMinutes.error?.message).toMatch(/actual minutes required/)
    expect((await stepsOf(A.client, act.id))[2].is_completed).toBe(false)

    const service = createSupabaseScheduleService(A.client)
    await expect(service.setStepCompleted(s3.id, true)).rejects.toMatchObject({ userMessage: SCHEDULE_MESSAGES.minutesRequired })

    expect(
      must(await A.client.rpc('set_subactivity_completed', { p_subactivity_id: s3.id, p_completed: true, p_actual_minutes: 27 })),
    ).toMatchObject({ done: 3, total: 3, activity_completed: true })
    expect(await sessionOf(A.client, act.id)).toMatchObject({ is_completed: true, actual_minutes: 27 })
  })

  it('desmarcar uma etapa reabre a principal preservando os minutos', async () => {
    const act = await save(A.client, await plan(A.client), STEPS, null, 'Sync 2')
    must(await A.client.rpc('complete_activity', { p_activity_id: act.id, p_actual_minutes: 20 }))
    const steps = await stepsOf(A.client, act.id)
    expect(steps.every((s) => s.is_completed && s.completed_at)).toBe(true)

    must(await A.client.rpc('set_subactivity_completed', { p_subactivity_id: steps[1].id, p_completed: false }))
    expect(await sessionOf(A.client, act.id)).toMatchObject({ is_completed: false, actual_minutes: 20 })
    expect((await stepsOf(A.client, act.id)).map((s) => s.is_completed)).toEqual([true, false, true])
  })

  it('concluir a principal marca todas; reabrir a principal deixa todas pendentes; uma só sessão', async () => {
    const act = await save(A.client, await plan(A.client), STEPS, null, 'Sync 3')
    must(await A.client.rpc('complete_activity', { p_activity_id: act.id, p_actual_minutes: 30 }))
    expect((await stepsOf(A.client, act.id)).every((s) => s.is_completed)).toBe(true)
    must(await A.client.rpc('reopen_activity', { p_activity_id: act.id }))
    expect((await stepsOf(A.client, act.id)).every((s) => !s.is_completed && s.completed_at === null)).toBe(true)
    must(await A.client.rpc('complete_activity', { p_activity_id: act.id, p_actual_minutes: 25 }))
    expect(must(await A.client.from('study_sessions').select('id').eq('activity_id', act.id))).toHaveLength(1)
  })

  it('adicionar etapa pendente a uma atividade concluída a reabre (minutos preservados)', async () => {
    const act = await save(A.client, await plan(A.client), STEPS, null, 'Sync 4')
    must(await A.client.rpc('complete_activity', { p_activity_id: act.id, p_actual_minutes: 18 }))
    const steps = await stepsOf(A.client, act.id)
    await save(A.client, await plan(A.client), [...steps.map((s) => ({ id: s.id, title: s.title, description: null, planned_minutes: s.planned_minutes })), { title: 'Extra', description: null, planned_minutes: 5 }], act.id, 'Sync 4')
    expect(await sessionOf(A.client, act.id)).toMatchObject({ is_completed: false, actual_minutes: 18 })
  })

  it('atividade antiga sem etapas: concluir/reabrir funcionam como antes', async () => {
    const act = await save(A.client, await plan(A.client), [], null, 'Antiga')
    must(await A.client.rpc('complete_activity', { p_activity_id: act.id, p_actual_minutes: 3 }))
    must(await A.client.rpc('reopen_activity', { p_activity_id: act.id }))
    expect(await sessionOf(A.client, act.id)).toMatchObject({ is_completed: false, actual_minutes: 3 })
  })

  it('resumo da semana conta só a atividade principal (sem somar etapas de novo)', async () => {
    const C = await createAccount('c')
    const act = await save(C.client, await plan(C.client), STEPS, null, 'Resumo')
    must(await C.client.rpc('complete_activity', { p_activity_id: act.id, p_actual_minutes: 22 }))
    const [s] = must(await C.client.rpc('get_week_summary', { p_week_start: WEEK }))
    expect(s).toMatchObject({ planned_count: 1, planned_minutes: 30, completed_count: 1, completed_minutes: 22 })
  })
})

describe('Isolamento entre contas', () => {
  let bAct = ''
  let bStep = ''
  beforeAll(async () => {
    const act = await save(B.client, bPlan, STEPS, null, 'De B')
    bAct = act.id
    bStep = (await stepsOf(B.client, act.id))[0].id
  })

  it('A não lê nem altera etapas de B', async () => {
    expect(must(await A.client.from('study_subactivities').select('id').eq('activity_id', bAct))).toEqual([])
    expect((await A.client.from('study_subactivities').update({ title: 'hack' }).eq('id', bStep).select()).data ?? []).toEqual([])
    expect((await A.client.from('study_subactivities').delete().eq('id', bStep).select()).data ?? []).toEqual([])
    expect((await A.client.rpc('set_subactivity_completed', { p_subactivity_id: bStep, p_completed: true })).error).not.toBeNull()
    expect((await A.client.rpc('schedule_write_steps', { p_activity_id: bAct, p_steps: [] as never })).error).not.toBeNull()
    expect((await A.client.rpc('save_activity', {
      p_activity_id: bAct, p_plan_id: bPlan, p_study_day: DAY, p_skill: 'lesson', p_title: 'hack', p_description: '', p_planned_minutes: 1, p_steps: [] as never,
    })).error).not.toBeNull()
    const still = must(await admin.from('study_subactivities').select('title, is_completed').eq('activity_id', bAct).order('position'))
    expect(still.map((s) => s.title)).toEqual(['Revisão', 'Gramática', 'Speaking'])
    expect(still.every((s) => !s.is_completed)).toBe(true)
  })

  it('FK composta: A não consegue vincular etapa à atividade de B (nem com o próprio user_id)', async () => {
    const asB = await A.client.from('study_subactivities').insert({ user_id: B.id, activity_id: bAct, position: 9, title: 'x', planned_minutes: 1 })
    expect(asB.error).not.toBeNull()
    const asA = await A.client.from('study_subactivities').insert({ user_id: A.id, activity_id: bAct, position: 9, title: 'x', planned_minutes: 1 })
    expect(asA.error).not.toBeNull()
  })

  it('save_activity rejeita id de etapa de outra atividade', async () => {
    const act = await save(A.client, await plan(A.client), STEPS, null, 'Roubo de etapa')
    const r = await A.client.rpc('save_activity', {
      p_activity_id: act.id, p_plan_id: await plan(A.client), p_study_day: DAY, p_skill: 'lesson', p_title: 'x', p_description: '', p_planned_minutes: 1,
      p_steps: [{ id: bStep, title: 'x', planned_minutes: 5 }] as never,
    })
    expect(r.error).not.toBeNull()
  })

  it('excluir atividade sem histórico remove as etapas em cascata', async () => {
    const act = await save(A.client, await plan(A.client), STEPS, null, 'Excluir')
    must(await A.client.from('study_activities').delete().eq('id', act.id).select())
    expect(must(await admin.from('study_subactivities').select('id').eq('activity_id', act.id))).toEqual([])
  })
})

describe('generate_schedule — idempotente e atômico', () => {
  const item = (key: string, day: string, steps = STEPS) => ({
    generator_key: key, study_day: day, skill: 'lesson', title: `Gerada ${key}`, description: 'd', planned_minutes: 1, steps,
  })

  it('cria planos ausentes (duas semanas), atividades e etapas; nada concluído', async () => {
    const D = await createAccount('d')
    const nextWeekDay = addDays(WEEK, 8)
    const r = must(await D.client.rpc('generate_schedule', {
      p_items: [item('lesson:4', DAY), item('lesson:5', nextWeekDay), { ...item('comp:x', DAY, []), planned_minutes: 20, skill: 'vocabulary' }] as never,
    }))
    expect(r).toEqual({ created: 3, skipped: 0, subactivities: 6 })
    const plans = must(await D.client.from('study_plans').select('week_start').order('week_start'))
    expect(plans.map((p) => p.week_start)).toEqual([WEEK, addDays(WEEK, 7)])
    const acts = must(await D.client.from('study_activities').select('generator_key, planned_minutes').order('generator_key'))
    expect(acts).toEqual([
      { generator_key: 'comp:x', planned_minutes: 20 },
      { generator_key: 'lesson:4', planned_minutes: 30 },
      { generator_key: 'lesson:5', planned_minutes: 30 },
    ])
    expect(must(await D.client.from('study_sessions').select('id'))).toHaveLength(0)
    expect(must(await D.client.from('study_subactivities').select('is_completed')).every((s) => !s.is_completed)).toBe(true)

    // reexecução: nada duplicado, nada sobrescrito
    must(await D.client.from('study_activities').update({ title: 'Editada pelo usuário' }).eq('generator_key', 'lesson:4').select('id'))
    const again = must(await D.client.rpc('generate_schedule', { p_items: [item('lesson:4', DAY), item('lesson:6', DAY)] as never }))
    expect(again).toEqual({ created: 1, skipped: 1, subactivities: 3 })
    expect(must(await D.client.from('study_activities').select('title').eq('generator_key', 'lesson:4').single()).title).toBe('Editada pelo usuário')
    expect(must(await D.client.from('study_activities').select('id'))).toHaveLength(4)

    // contexto do gerador via serviço
    const ctx = await createSupabaseScheduleService(D.client).loadGeneratorContext(WEEK, addDays(WEEK, 6))
    expect(ctx.generatedKeys.sort()).toEqual(['comp:x', 'lesson:4', 'lesson:5', 'lesson:6'])
  })

  it('item inválido no meio do lote: erro e NADA gravado (tudo ou nada)', async () => {
    const E = await createAccount('e')
    const r = await E.client.rpc('generate_schedule', {
      p_items: [item('ok:1', DAY), item('bad:2', DAY, [{ title: '', description: null, planned_minutes: 5 }])] as never,
    })
    expect(r.error).not.toBeNull()
    expect(must(await E.client.from('study_activities').select('id'))).toHaveLength(0)
    expect(must(await E.client.from('study_plans').select('id'))).toHaveLength(0)
    const noKey = await E.client.rpc('generate_schedule', { p_items: [{ ...item('', DAY) }] as never })
    expect(noKey.error).not.toBeNull()
  })

  it('a mesma chave em contas diferentes não colide', async () => {
    must(await A.client.rpc('generate_schedule', { p_items: [item('lesson:4', DAY)] as never }))
    must(await B.client.rpc('generate_schedule', { p_items: [item('lesson:4', DAY)] as never }))
    expect(must(await admin.from('study_activities').select('user_id').eq('generator_key', 'lesson:4').in('user_id', [A.id, B.id]))).toHaveLength(2)
  })
})
