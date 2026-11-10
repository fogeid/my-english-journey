import type { Database } from '../../lib/database.types'
import { isDateInWeek, type IsoDate } from './week'

type Tables = Database['public']['Tables']

export type Plan = Pick<Tables['study_plans']['Row'], 'id' | 'week_start' | 'title'>
export type Activity = Pick<
  Tables['study_activities']['Row'],
  'id' | 'plan_id' | 'study_day' | 'position' | 'skill' | 'title' | 'description' | 'planned_minutes'
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
  summary: WeekSummary
}

/** Categorias oferecidas na interface (MVP da ET-002). */
export const MVP_CATEGORIES = ['grammar', 'vocabulary', 'listening', 'speaking', 'review', 'other'] as const

export const CATEGORY_LABELS: Record<string, string> = {
  grammar: 'Gramática',
  vocabulary: 'Vocabulário',
  listening: 'Listening',
  speaking: 'Speaking',
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
  ctx: { weekStart: IsoDate; countOnTargetDay: number; allowedSkills?: readonly string[] },
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

  const minutes = parseInteger(input.plannedMinutes)
  if (minutes === null || minutes < LIMITS.plannedMin || minutes > LIMITS.plannedMax) {
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
