import type { DbClient } from '../../lib/supabase-context'
import type { Activity, ActivityValues, Plan, Session, Step, StepValues, WeekData, WeekSummary } from './schedule-model'
import { formatDate, type IsoDate } from './week'

/** Erro com mensagem segura para exibir ao usuário. */
export class ScheduleError extends Error {
  readonly userMessage: string
  constructor(userMessage: string, cause?: unknown) {
    super(userMessage, { cause })
    this.name = 'ScheduleError'
    this.userMessage = userMessage
  }
}

export const SCHEDULE_MESSAGES = {
  load: 'Não foi possível carregar o cronograma. Verifique sua conexão e tente novamente.',
  save: 'Não foi possível salvar. Verifique sua conexão e tente novamente.',
  history: 'Esta atividade já tem execução registrada e não pode ser excluída.',
  perDay: 'Este dia já tem 30 atividades (limite).',
  invalid: 'Dados inválidos. Revise os campos e tente novamente.',
  summary: 'Não foi possível carregar o resumo da semana.',
  generate: 'Não foi possível gerar o cronograma. Nada foi gravado; tente novamente.',
  minutesRequired: 'Informe os minutos reais para concluir a última etapa.',
  tooLong: 'A soma das etapas passa do limite de 240 min por atividade.',
} as const

interface PgError {
  code?: string
  message?: string
}

function toScheduleError(error: PgError | null | undefined, fallback: string): ScheduleError {
  const msg = error?.message ?? ''
  if (/execution history/.test(msg)) return new ScheduleError(SCHEDULE_MESSAGES.history, error)
  if (/more than 30 activities/.test(msg)) return new ScheduleError(SCHEDULE_MESSAGES.perDay, error)
  if (/actual minutes required/.test(msg)) return new ScheduleError(SCHEDULE_MESSAGES.minutesRequired, error)
  if (/planned_minutes_range|planned_minutes_check/.test(msg)) return new ScheduleError(SCHEDULE_MESSAGES.tooLong, error)
  if (error?.code === '23514' || error?.code === '22023') return new ScheduleError(SCHEDULE_MESSAGES.invalid, error)
  return new ScheduleError(fallback, error)
}

export interface ScheduleService {
  loadWeek(weekStart: IsoDate): Promise<WeekData>
  getWeekSummary(weekStart: IsoDate): Promise<WeekSummary>
  /** Plano inicial da semana atual (servidor decide a semana). Idempotente. */
  createInitialPlan(): Promise<void>
  /** Plano vazio para a semana. Idempotente (já existente = sucesso). */
  createEmptyPlan(userId: string, weekStart: IsoDate): Promise<void>
  createActivity(userId: string, planId: string, values: ActivityValues): Promise<void>
  updateActivity(activityId: string, values: ActivityValues): Promise<void>
  deleteActivity(activityId: string): Promise<void>
  completeActivity(activityId: string, actualMinutes: number): Promise<void>
  reopenActivity(activityId: string): Promise<void>
  reorderDay(planId: string, day: IsoDate, orderedIds: string[]): Promise<void>
  // ---- ET-007: etapas e gerador ----
  /** Cria (activityId null) ou edita a atividade e suas etapas numa única transação. */
  saveActivity(input: { activityId: string | null; planId: string; values: ActivityValues; steps: StepValues[] }): Promise<void>
  /** Marca/desmarca uma etapa. Na última etapa pendente, actualMinutes conclui a atividade principal. */
  setStepCompleted(stepId: string, completed: boolean, actualMinutes?: number): Promise<void>
  /** Grava os itens do gerador numa única transação; itens já existentes são ignorados. */
  generate(items: GeneratorItemPayload[]): Promise<{ created: number; skipped: number }>
  /** Atividades existentes no intervalo + chaves já geradas (para detectar conflitos na prévia). */
  loadGeneratorContext(from: IsoDate, to: IsoDate): Promise<GeneratorContext>
}

export interface GeneratorItemPayload {
  generator_key: string
  study_day: IsoDate
  skill: string
  title: string
  description: string | null
  planned_minutes: number
  steps: { title: string; description: string | null; planned_minutes: number }[]
}
export interface GeneratorContext {
  activities: { study_day: string; skill: string; title: string; generator_key: string | null }[]
  generatedKeys: string[]
}

const EMPTY_SUMMARY: WeekSummary = {
  has_plan: false,
  planned_count: 0,
  planned_minutes: 0,
  completed_count: 0,
  completed_minutes: 0,
}

export function createSupabaseScheduleService(client: DbClient): ScheduleService {
  async function getWeekSummary(weekStart: IsoDate): Promise<WeekSummary> {
    const { data, error } = await client.rpc('get_week_summary', { p_week_start: weekStart })
    if (error || !data || data.length !== 1) throw toScheduleError(error, SCHEDULE_MESSAGES.summary)
    return data[0]
  }

  return {
    getWeekSummary,

    async loadWeek(weekStart) {
      const planRes = await client
        .from('study_plans')
        .select('id, week_start, title')
        .eq('week_start', weekStart)
        .maybeSingle()
      if (planRes.error) throw toScheduleError(planRes.error, SCHEDULE_MESSAGES.load)
      const plan: Plan | null = planRes.data
      if (!plan) return { weekStart, plan: null, activities: [], sessions: {}, steps: {}, summary: EMPTY_SUMMARY }

      const actRes = await client
        .from('study_activities')
        .select('id, plan_id, study_day, position, skill, title, description, planned_minutes')
        .eq('plan_id', plan.id)
        .order('study_day')
        .order('position')
        .order('id')
      if (actRes.error) throw toScheduleError(actRes.error, SCHEDULE_MESSAGES.load)
      const activities: Activity[] = actRes.data

      const sessions: Record<string, Session> = {}
      if (activities.length > 0) {
        const sesRes = await client
          .from('study_sessions')
          .select('id, activity_id, completed_at, actual_minutes, is_completed, reopened_at')
          .in(
            'activity_id',
            activities.map((a) => a.id),
          )
        if (sesRes.error) throw toScheduleError(sesRes.error, SCHEDULE_MESSAGES.load)
        for (const s of sesRes.data) if (s.activity_id) sessions[s.activity_id] = s
      }

      const steps: Record<string, Step[]> = {}
      if (activities.length > 0) {
        const stRes = await client
          .from('study_subactivities')
          .select('id, activity_id, position, title, description, planned_minutes, is_completed, completed_at')
          .in(
            'activity_id',
            activities.map((a) => a.id),
          )
          .order('position')
          .order('id')
        if (stRes.error) throw toScheduleError(stRes.error, SCHEDULE_MESSAGES.load)
        for (const st of stRes.data) (steps[st.activity_id] ??= []).push(st)
      }

      const summary = await getWeekSummary(weekStart).catch((e: unknown) => {
        throw e instanceof ScheduleError ? new ScheduleError(SCHEDULE_MESSAGES.load, e) : e
      })
      return { weekStart, plan, activities, sessions, steps, summary }
    },

    async createInitialPlan() {
      const { error } = await client.rpc('create_initial_plan')
      if (error) throw toScheduleError(error, SCHEDULE_MESSAGES.save)
    },

    async createEmptyPlan(userId, weekStart) {
      const { error } = await client
        .from('study_plans')
        .insert({ user_id: userId, week_start: weekStart, title: `Semana de ${formatDate(weekStart)}` })
      // 23505 = plano da semana já existe: a ação é idempotente.
      if (error && error.code !== '23505') throw toScheduleError(error, SCHEDULE_MESSAGES.save)
    },

    async createActivity(userId, planId, v) {
      const { error } = await client.from('study_activities').insert({
        user_id: userId,
        plan_id: planId,
        study_day: v.studyDay,
        skill: v.skill,
        title: v.title,
        description: v.description,
        planned_minutes: v.plannedMinutes,
      })
      if (error) throw toScheduleError(error, SCHEDULE_MESSAGES.save)
    },

    async updateActivity(activityId, v) {
      const { data, error } = await client
        .from('study_activities')
        .update({
          study_day: v.studyDay,
          skill: v.skill,
          title: v.title,
          description: v.description,
          planned_minutes: v.plannedMinutes,
        })
        .eq('id', activityId)
        .select('id')
      if (error || !data || data.length !== 1) throw toScheduleError(error, SCHEDULE_MESSAGES.save)
    },

    async deleteActivity(activityId) {
      const { data, error } = await client.from('study_activities').delete().eq('id', activityId).select('id')
      if (error || !data || data.length !== 1) throw toScheduleError(error, SCHEDULE_MESSAGES.save)
    },

    async completeActivity(activityId, actualMinutes) {
      const { error } = await client.rpc('complete_activity', {
        p_activity_id: activityId,
        p_actual_minutes: actualMinutes,
      })
      if (error) throw toScheduleError(error, SCHEDULE_MESSAGES.save)
    },

    async reopenActivity(activityId) {
      const { error } = await client.rpc('reopen_activity', { p_activity_id: activityId })
      if (error) throw toScheduleError(error, SCHEDULE_MESSAGES.save)
    },

    async reorderDay(planId, day, orderedIds) {
      const { error } = await client.rpc('reorder_day_activities', {
        p_plan_id: planId,
        p_study_day: day,
        p_ids: orderedIds,
      })
      if (error) throw toScheduleError(error, SCHEDULE_MESSAGES.save)
    },

    async saveActivity({ activityId, planId, values, steps }) {
      const { error } = await client.rpc('save_activity', {
        p_activity_id: activityId as string,
        p_plan_id: planId,
        p_study_day: values.studyDay,
        p_skill: values.skill,
        p_title: values.title,
        p_description: values.description ?? '',
        p_planned_minutes: values.plannedMinutes,
        p_steps: steps as never, // jsonb
      })
      if (error) throw toScheduleError(error, SCHEDULE_MESSAGES.save)
    },

    async setStepCompleted(stepId, completed, actualMinutes) {
      const { error } = await client.rpc('set_subactivity_completed', {
        p_subactivity_id: stepId,
        p_completed: completed,
        ...(actualMinutes === undefined ? {} : { p_actual_minutes: actualMinutes }),
      })
      if (error) throw toScheduleError(error, SCHEDULE_MESSAGES.save)
    },

    async generate(items) {
      const { data, error } = await client.rpc('generate_schedule', { p_items: items as never })
      if (error || !data) throw toScheduleError(error, SCHEDULE_MESSAGES.generate)
      const r = data as { created?: number; skipped?: number }
      return { created: r.created ?? 0, skipped: r.skipped ?? 0 }
    },

    async loadGeneratorContext(from, to) {
      const cols = 'id, study_day, skill, title, generator_key'
      const [range, numbered, keys] = await Promise.all([
        // tudo o que já existe nos dias que serão gerados (conflitos por data/tipo)
        client.from('study_activities').select(cols).gte('study_day', from).lte('study_day', to).order('study_day'),
        // aulas e estudos musicais em QUALQUER data (conflitos por número)
        client.from('study_activities').select(cols).in('skill', ['lesson', 'music']).order('study_day').limit(5000),
        client.from('study_activities').select('generator_key').not('generator_key', 'is', null).limit(5000),
      ])
      const err = range.error ?? numbered.error ?? keys.error
      if (err || !range.data || !numbered.data || !keys.data) throw toScheduleError(err, SCHEDULE_MESSAGES.load)
      const byId = new Map([...range.data, ...numbered.data].map((a) => [a.id, a]))
      return {
        activities: [...byId.values()].map(({ study_day, skill, title, generator_key }) => ({ study_day, skill, title, generator_key })),
        generatedKeys: keys.data.map((k) => k.generator_key).filter((k): k is string => !!k),
      }
    },
  }
}
