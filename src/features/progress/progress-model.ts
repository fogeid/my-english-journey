import { overallScore } from '../lessons/lesson-model'
import { addDays, APP_TIME_ZONE, civilDateInZone, weekStartOf, type IsoDate } from '../schedule/week'

/**
 * ET-005 — regras de cálculo do progresso. Funções puras sobre dados reais do usuário.
 * Datas civis no fuso America/Cuiaba. Nada é inventado: sem dados → null/0 e estado vazio.
 */

export type Period = '7d' | '30d' | '90d' | 'all'
export const PERIODS: { value: Period; label: string; days: number | null }[] = [
  { value: '7d', label: '7 dias', days: 7 },
  { value: '30d', label: '30 dias', days: 30 },
  { value: '90d', label: '90 dias', days: 90 },
  { value: 'all', label: 'Todo o período', days: null },
]

/** Habilidades (o bloco "revisão" não é uma habilidade independente). */
export const SKILLS: { value: string; label: string }[] = [
  { value: 'grammar', label: 'Grammar' },
  { value: 'vocabulary', label: 'Vocabulary' },
  { value: 'listening', label: 'Listening' },
  { value: 'speaking', label: 'Speaking' },
  { value: 'reading', label: 'Reading' },
  { value: 'writing', label: 'Writing' },
]

export interface RawSession {
  actual_minutes: number
  is_completed: boolean
  completed_at: string
  activity_id: string | null
}
export interface RawActivity {
  id: string
  study_day: string
  planned_minutes: number
}
export interface RawLesson {
  id: string
  lesson_number: number
  title: string | null
  studied_on: string | null
  status: string
  difficulties: string | null
  recommendations: string | null
  lesson_blocks: { block_type: string; score: number | null }[]
}
export interface RawProgressData {
  sessions: RawSession[]
  activities: RawActivity[]
  lessons: RawLesson[]
  /** created_at de todas as palavras (o total é de todo o período) */
  vocabularyCreatedAt: string[]
  /** reviewed_at das revisões (já filtradas pelo início do período no servidor) */
  reviewedAt: string[]
  /** ET-007: estudos musicais (data registrada e status); só os concluídos contam como dia de estudo */
  musicStudies?: { studied_on: string | null; status: string }[]
}

export interface Range {
  from: IsoDate | null // null = desde o primeiro registro
  to: IsoDate
}

/** Últimos N dias INCLUINDO hoje (ex.: 7 dias = hoje e os 6 anteriores). */
export function periodRange(period: Period, today: IsoDate): Range {
  const days = PERIODS.find((p) => p.value === period)!.days
  return { from: days === null ? null : addDays(today, -(days - 1)), to: today }
}

const inRange = (date: IsoDate | null, r: Range) => date !== null && date <= r.to && (r.from === null || date >= r.from)
const round1 = (n: number) => Math.round(n * 10 + Number.EPSILON) / 10
const daysBetween = (a: IsoDate, b: IsoDate) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1

export interface ScorePoint {
  lessonId: string
  lessonNumber: number
  title: string | null
  date: IsoDate
  score: number
}
export interface SkillStat {
  skill: string
  label: string
  average: number | null
  blocks: number
}
export interface WeekStat {
  weekStart: IsoDate
  days: number
}
export interface LessonNote {
  lessonId: string
  lessonNumber: number
  title: string | null
  date: IsoDate | null
  difficulties: string | null
  recommendations: string | null
}
export interface Progress {
  range: Range
  completedLessons: number
  minutesStudied: number
  completedSessions: number
  wordsTotal: number
  wordsAdded: number
  reviewsDone: number
  studyDays: number
  /** primeiro dia do período (em "todo o período", o 1º dia com estudo; null se não houver) */
  firstDay: IsoDate | null
  periodDays: number
  avgDaysPerWeek: number | null
  weeks: WeekStat[]
  planned: { activities: number; minutes: number }
  realized: { activities: number; minutes: number }
  scoreSeries: ScorePoint[]
  completedWithoutScore: number
  skills: SkillStat[]
  notes: LessonNote[]
}

export function computeProgress(raw: RawProgressData, period: Period, today: IsoDate, timeZone: string = APP_TIME_ZONE): Progress {
  const range = periodRange(period, today)
  const dayOf = (instant: string) => civilDateInZone(new Date(instant), timeZone)

  // Lições no período: pela data da aula. Em "todo o período", aulas sem data também contam
  // nos totais (mas não entram em séries temporais, que exigem data).
  const lessonInPeriod = (l: RawLesson) => (range.from === null ? l.studied_on === null || l.studied_on <= range.to : inRange(l.studied_on, range))
  const lessons = raw.lessons.filter(lessonInPeriod)
  const completed = lessons.filter((l) => l.status === 'completed')

  // Horas: somente execuções CONCLUÍDAS do cronograma (study_sessions), pelo dia real de conclusão.
  // Aulas não têm campo de tempo e não há vínculo atividade↔aula: não há dupla contagem.
  const sessions = raw.sessions.filter((s) => s.is_completed && inRange(dayOf(s.completed_at), range))
  const minutesStudied = sessions.reduce((n, s) => n + s.actual_minutes, 0)

  // Planejado × realizado: atividades com dia planejado no período; realizadas = com execução concluída.
  const plannedActs = raw.activities.filter((a) => inRange(a.study_day, range))
  const doneByActivity = new Map(raw.sessions.filter((s) => s.is_completed && s.activity_id).map((s) => [s.activity_id!, s.actual_minutes]))
  const realizedActs = plannedActs.filter((a) => doneByActivity.has(a.id))

  const reviews = raw.reviewedAt.map(dayOf).filter((d) => inRange(d, range))
  const wordsAdded = raw.vocabularyCreatedAt.map(dayOf).filter((d) => inRange(d, range)).length

  // ET-007: estudo musical CONCLUÍDO conta na data registrada (sem duração: não entra nas horas).
  const musicDays = (raw.musicStudies ?? [])
    .filter((m) => m.status === 'completed')
    .map((m) => m.studied_on)
    .filter((d): d is IsoDate => d !== null && inRange(d, range))

  // Dia de estudo = dia civil com ao menos: uma execução concluída, uma aula registrada (data da aula),
  // uma revisão de vocabulário ou um estudo musical concluído. O Set evita contar o mesmo dia duas vezes.
  const studyDaySet = new Set<IsoDate>([
    ...sessions.map((s) => dayOf(s.completed_at)),
    ...lessons.map((l) => l.studied_on).filter((d): d is IsoDate => d !== null && inRange(d, range)),
    ...reviews,
    ...musicDays,
  ])
  const firstDay = range.from ?? [...studyDaySet].sort()[0] ?? null
  const periodDays = firstDay ? daysBetween(firstDay, range.to) : 0
  // Frequência = dias com estudo ÷ (dias do período ÷ 7). "Todo o período" começa no 1º dia com estudo.
  const avgDaysPerWeek = periodDays > 0 ? round1(studyDaySet.size / (periodDays / 7)) : null

  // Semanas ISO (segunda) cobertas pelo período; no máximo as 26 mais recentes.
  const weeks: WeekStat[] = []
  if (firstDay) {
    for (let w = weekStartOf(range.to); w >= weekStartOf(firstDay) && weeks.length < 26; w = addDays(w, -7)) {
      const days = [...studyDaySet].filter((d) => weekStartOf(d) === w).length
      weeks.unshift({ weekStart: w, days })
    }
  }

  // Evolução: aulas CONCLUÍDAS com data e ao menos um bloco avaliado; nota = regra da ET-004.
  const scoreSeries: ScorePoint[] = completed
    .filter((l) => l.studied_on !== null)
    .map((l) => ({ l, score: overallScore(l.lesson_blocks.map((b) => ({ score: b.score === null ? null : Number(b.score) }))) }))
    .filter((x): x is { l: RawLesson; score: number } => x.score !== null)
    .map(({ l, score }) => ({ lessonId: l.id, lessonNumber: l.lesson_number, title: l.title, date: l.studied_on!, score }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.lessonNumber - b.lessonNumber)
  const completedWithoutScore = completed.filter((l) => l.lesson_blocks.every((b) => b.score === null)).length

  // Habilidades: média simples das notas dos blocos (com nota) das aulas CONCLUÍDAS; "review" fica de fora.
  const skills: SkillStat[] = SKILLS.map(({ value, label }) => {
    const scores = completed.flatMap((l) => l.lesson_blocks).filter((b) => b.block_type === value && b.score !== null).map((b) => Number(b.score))
    return { skill: value, label, blocks: scores.length, average: scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null }
  })

  const notes: LessonNote[] = lessons
    .filter((l) => l.difficulties || l.recommendations)
    .sort((a, b) => (b.studied_on ?? '').localeCompare(a.studied_on ?? '') || b.lesson_number - a.lesson_number)
    .map((l) => ({ lessonId: l.id, lessonNumber: l.lesson_number, title: l.title, date: l.studied_on, difficulties: l.difficulties, recommendations: l.recommendations }))

  return {
    range,
    completedLessons: completed.length,
    minutesStudied,
    completedSessions: sessions.length,
    wordsTotal: raw.vocabularyCreatedAt.length,
    wordsAdded,
    reviewsDone: reviews.length,
    studyDays: studyDaySet.size,
    firstDay,
    periodDays,
    avgDaysPerWeek,
    weeks,
    planned: { activities: plannedActs.length, minutes: plannedActs.reduce((n, a) => n + a.planned_minutes, 0) },
    realized: { activities: realizedActs.length, minutes: realizedActs.reduce((n, a) => n + (doneByActivity.get(a.id) ?? 0), 0) },
    scoreSeries,
    completedWithoutScore,
    skills,
    notes,
  }
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`
}

/** Início (instante UTC) do dia civil no fuso — usado só para filtrar no servidor (com folga). */
export function startOfCivilDayUtc(date: IsoDate, timeZone: string = APP_TIME_ZONE): Date {
  const guess = new Date(`${date}T00:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(guess)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return new Date(guess.getTime() - (wall - guess.getTime()))
}
