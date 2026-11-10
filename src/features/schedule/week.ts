/**
 * Datas do cronograma: dias CIVIS ('YYYY-MM-DD') no fuso do usuário.
 * Semana ISO: segunda (1) a domingo (7). A aritmética é feita sobre datas civis
 * (via UTC, sem horário), então não há deslocamento por fuso ou horário de verão.
 */
export const APP_TIME_ZONE = 'America/Cuiaba'

export type IsoDate = string // 'YYYY-MM-DD'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function toUtc(date: IsoDate): Date {
  const m = ISO_DATE.exec(date)
  if (!m) throw new Error(`Data inválida: ${date}`)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10)
}

/** Dia civil de um instante no fuso informado. */
export function civilDateInZone(instant: Date, timeZone: string = APP_TIME_ZONE): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUtc(d)
}

/** 1 = segunda ... 7 = domingo. */
export function isoWeekday(date: IsoDate): number {
  const day = toUtc(date).getUTCDay() // 0 = domingo
  return ((day + 6) % 7) + 1
}

/** Segunda-feira da semana ISO que contém a data. */
export function weekStartOf(date: IsoDate): IsoDate {
  return addDays(date, -(isoWeekday(date) - 1))
}

/** Segunda-feira da semana atual no fuso do app. */
export function currentWeekStart(now: Date = new Date(), timeZone: string = APP_TIME_ZONE): IsoDate {
  return weekStartOf(civilDateInZone(now, timeZone))
}

/** Os 7 dias (segunda → domingo) da semana iniciada em weekStart. */
export function weekDays(weekStart: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

export function isDateInWeek(date: IsoDate, weekStart: IsoDate): boolean {
  return date >= weekStart && date <= addDays(weekStart, 6)
}

const dayLabelFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: '2-digit' })
const shortDateFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' })

/** "segunda-feira, 09/11" */
export function formatDayLabel(date: IsoDate): string {
  return dayLabelFmt.format(toUtc(date))
}

/** "09/11/2026" */
export function formatDate(date: IsoDate): string {
  return shortDateFmt.format(toUtc(date))
}

/** "09/11/2026 – 15/11/2026" */
export function formatWeekRange(weekStart: IsoDate): string {
  return `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`
}

/** Instante (timestamptz) exibido no fuso do app: "10/11/2026 14:05". */
export function formatDateTime(instant: string | Date, timeZone: string = APP_TIME_ZONE): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}
