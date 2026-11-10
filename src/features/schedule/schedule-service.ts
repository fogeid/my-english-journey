import type { DbClient } from '../../lib/supabase-context'
import type { Activity, ActivityValues, Plan, Session, WeekData, WeekSummary } from './schedule-model'
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
} as const

interface PgError {
  code?: string
  message?: string
}

function toScheduleError(error: PgError | null | undefined, fallback: string): ScheduleError {
  const msg = error?.message ?? ''
  if (/execution history/.test(msg)) return new ScheduleError(SCHEDULE_MESSAGES.history, error)
  if (/more than 30 activities/.test(msg)) return new ScheduleError(SCHEDULE_MESSAGES.perDay, error)
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
      if (!plan) return { weekStart, plan: null, activities: [], sessions: {}, summary: EMPTY_SUMMARY }

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

      const summary = await getWeekSummary(weekStart).catch((e: unknown) => {
        throw e instanceof ScheduleError ? new ScheduleError(SCHEDULE_MESSAGES.load, e) : e
      })
      return { weekStart, plan, activities, sessions, summary }
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
  }
}
