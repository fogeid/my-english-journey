import type { Database } from '../../lib/database.types'
import { isDateInWeek, type IsoDate } from './week'

type Tables = Database['public']['Tables']

export type Plan = Pick<Tables['study_plans']['Row'], 'id' | 'week_start' | 'title'>
export type Activity = Pick<
  Tables['study_activities']['Row'],
  'id' | 'plan_id' | 'study_day' | 'position' | 'skill' | 'title' | 'description' | 'planned_minutes'
>
/** Etapa (subatividade) de uma atividade — ET-007. */
export type Step = Pick<
  Tables['study_subactivities']['Row'],
  'id' | 'activity_id' | 'position' | 'title' | 'description' | 'planned_minutes' | 'is_completed' | 'completed_at'
>
export type Session = Pick<
  Tables['study_sessions']['Row'],
  'id' | 'activity_id' | 'completed_at' | 'actual_minutes' | 'is_completed' | 'reopened_at'
>

export interface WeekSummary {
  has_plan: boolean
  planned_count: number
  planned_minutes: number
  completed_count: number
  completed_minutes: number
}

export interface WeekData {
  weekStart: IsoDate
  plan: Plan | null
  activities: Activity[]
  /** execução por activity_id (no máximo uma por atividade) */
  sessions: Record<string, Session>
  /** etapas por activity_id, em ordem (vazio = atividade sem etapas, comportamento da ET-002) */
  steps: Record<string, Step[]>
  summary: WeekSummary
}

/** Categorias oferecidas na interface (ET-002 + Aula ChatGPT, Estudo musical e Reading da ET-007). */
export const MVP_CATEGORIES = ['lesson', 'music', 'grammar', 'vocabulary', 'listening', 'speaking', 'reading', 'review', 'other'] as const

export const CATEGORY_LABELS: Record<string, string> = {
  lesson: 'Aula ChatGPT',
  music: 'Estudo musical',
  grammar: 'Gramática',
  vocabulary: 'Vocabulário',
  listening: 'Listening',
  speaking: 'Speaking',
  reading: 'Reading',
  review: 'Revisão',
  other: 'Outro',
  writing: 'Writing', // aceito no banco por compatibilidade com a ET-001; não oferecido para novas atividades
}

export const LIMITS = {
  titleMax: 120,
  descriptionMax: 2000,
  plannedMin: 1,
  plannedMax: 240,
  actualMin: 0,
  actualMax: 480,
  perDayMax: 30,
  stepsMax: 20,
  stepTitleMax: 120,
  stepDescriptionMax: 1000,
} as const

export interface ActivityInput {
  title: string
  description: string
  skill: string
  plannedMinutes: string
  studyDay: IsoDate
}

export interface ActivityValues {
  title: string
  description: string | null
  skill: string
  plannedMinutes: number
  studyDay: IsoDate
}

export type ActivityErrors = Partial<Record<keyof ActivityInput, string>>

function parseInteger(raw: string): number | null {
  const s = raw.trim()
  if (!/^\d+$/.test(s)) return null
  return Number(s)
}

/**
 * Regras de validação de atividade (mesmas regras do banco, que é a garantia final).
 * `allowedSkills` permite manter a categoria legada de uma atividade existente.
 */
export function validateActivity(
  input: ActivityInput,
  ctx: {
    weekStart: IsoDate
    countOnTargetDay: number
    allowedSkills?: readonly string[]
    /** com etapas, os minutos previstos são a soma delas (validados em validateSteps) */
    stepsTotal?: number | null
  },
): { values: ActivityValues | null; errors: ActivityErrors } {
  const errors: ActivityErrors = {}
  const title = input.title.trim()
  if (title.length === 0) errors.title = 'Informe um título.'
  else if (title.length > LIMITS.titleMax) errors.title = `Use no máximo ${LIMITS.titleMax} caracteres.`

  const description = input.description.trim()
  if (description.length > LIMITS.descriptionMax) {
    errors.description = `Use no máximo ${LIMITS.descriptionMax} caracteres.`
  }

  const allowed = ctx.allowedSkills ?? MVP_CATEGORIES
  if (!allowed.includes(input.skill)) errors.skill = 'Escolha uma categoria.'

  const hasSteps = ctx.stepsTotal !== undefined && ctx.stepsTotal !== null
  const minutes = hasSteps ? ctx.stepsTotal! : parseInteger(input.plannedMinutes)
  if (!hasSteps && (minutes === null || minutes < LIMITS.plannedMin || minutes > LIMITS.plannedMax)) {
    errors.plannedMinutes = `Informe um número inteiro de ${LIMITS.plannedMin} a ${LIMITS.plannedMax}.`
  }

  if (!isDateInWeek(input.studyDay, ctx.weekStart)) errors.studyDay = 'Escolha um dia desta semana.'
  else if (ctx.countOnTargetDay >= LIMITS.perDayMax) {
    errors.studyDay = `Este dia já tem ${LIMITS.perDayMax} atividades (limite).`
  }

  if (Object.keys(errors).length > 0) return { values: null, errors }
  return {
    values: { title, description: description || null, skill: input.skill, plannedMinutes: minutes!, studyDay: input.studyDay },
    errors,
  }
}

/** Minutos reais confirmados pelo usuário: inteiro 0–480. */
export function validateActualMinutes(raw: string): { value: number | null; error: string | null } {
  const n = parseInteger(raw)
  if (n === null || n < LIMITS.actualMin || n > LIMITS.actualMax) {
    return { value: null, error: `Informe um número inteiro de ${LIMITS.actualMin} a ${LIMITS.actualMax}.` }
  }
  return { value: n, error: null }
}

export function activitiesOfDay(activities: Activity[], day: IsoDate): Activity[] {
  return activities
    .filter((a) => a.study_day === day)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

/** Progresso semanal em % inteiro: concluídas / planejadas; 0 quando não há atividades. */
export function weekProgressPercent(summary: WeekSummary): number {
  if (summary.planned_count === 0) return 0
  return Math.round((summary.completed_count / summary.planned_count) * 100)
}

// ---------- Etapas (subatividades) — ET-007 ----------
export interface StepInput {
  /** chave local estável (React) */
  key: string
  /** id no banco quando a etapa já existe (preserva o status ao editar) */
  id?: string
  title: string
  description: string
  plannedMinutes: string
}
export interface StepValues {
  id?: string
  title: string
  description: string | null
  planned_minutes: number
}
export type StepErrors = Record<string, { title?: string; description?: string; plannedMinutes?: string }>

/**
 * Valida as etapas e calcula o total. Total = soma das etapas (é o tempo previsto da atividade);
 * precisa caber no limite da atividade (1–240 min).
 */
export function validateSteps(steps: StepInput[]): { values: StepValues[] | null; errors: StepErrors; total: number; formError: string | null } {
  const errors: StepErrors = {}
  let total = 0
  const values: StepValues[] = []
  for (const st of steps) {
    const e: StepErrors[string] = {}
    const title = st.title.trim()
    const description = st.description.trim()
    const minutes = parseInteger(st.plannedMinutes)
    if (!title) e.title = 'Informe o título da etapa.'
    else if (title.length > LIMITS.stepTitleMax) e.title = `Use no máximo ${LIMITS.stepTitleMax} caracteres.`
    if (description.length > LIMITS.stepDescriptionMax) e.description = `Use no máximo ${LIMITS.stepDescriptionMax} caracteres.`
    if (minutes === null || minutes < LIMITS.plannedMin || minutes > LIMITS.plannedMax) e.plannedMinutes = `De ${LIMITS.plannedMin} a ${LIMITS.plannedMax} min.`
    else total += minutes
    if (Object.keys(e).length) errors[st.key] = e
    else values.push({ ...(st.id ? { id: st.id } : {}), title, description: description || null, planned_minutes: minutes! })
  }
  let formError: string | null = null
  if (steps.length > LIMITS.stepsMax) formError = `No máximo ${LIMITS.stepsMax} etapas por atividade.`
  else if (total > LIMITS.plannedMax) formError = `A soma das etapas (${total} min) passa do limite de ${LIMITS.plannedMax} min por atividade.`
  const ok = Object.keys(errors).length === 0 && !formError
  return { values: ok ? values : null, errors, total, formError }
}

export function sortSteps(steps: Step[]): Step[] {
  return [...steps].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

/** Progresso em etapas: concluídas / total e % inteiro. */
export function stepsProgress(steps: Pick<Step, 'is_completed'>[]): { done: number; total: number; percent: number } {
  const done = steps.filter((s) => s.is_completed).length
  return { done, total: steps.length, percent: steps.length ? Math.round((done / steps.length) * 100) : 0 }
}
