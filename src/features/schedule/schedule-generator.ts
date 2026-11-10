import {
  COMPLEMENTARY_BY_WEEKDAY,
  LESSON_BLOCKS,
  LESSON_THEMES,
  MUSIC_BLOCKS,
  MUSIC_THEMES,
  type StepTemplate,
} from './generator-content'
import type { GeneratorContext, GeneratorItemPayload } from './schedule-service'
import { addDays, isoWeekday, type IsoDate } from './week'

/**
 * Gerador de cronograma (ET-007) — funções puras. Monta a PRÉVIA a partir do conteúdo planejado
 * e classifica cada item contra o que já existe; só itens "new" e selecionados são gravados.
 */

export interface GeneratorConfig {
  startDate: IsoDate
  days: number
  nextLesson: number
  nextMusic: number
  lessonMinutes: number
  musicMinutes: number
  includeComplementary: boolean
}

export type ItemKind = 'lesson' | 'music' | 'complementary'
export type ItemStatus = 'new' | 'exists' | 'conflict'

export interface PreviewItem extends GeneratorItemPayload {
  kind: ItemKind
  status: ItemStatus
  /** motivo do conflito/existência, para o aviso na prévia */
  reason: string | null
  /** número da aula/estudo, quando houver */
  number: number | null
  /** sem tema/música planejados para este número */
  unplanned: boolean
}

export const GENERATOR_LIMITS = { daysMin: 1, daysMax: 14, numberMax: 999, minutesMin: 6, minutesMax: 240 } as const

export function validateConfig(c: GeneratorConfig): string[] {
  const errors: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate)) errors.push('Informe a data de início.')
  if (!Number.isInteger(c.days) || c.days < GENERATOR_LIMITS.daysMin || c.days > GENERATOR_LIMITS.daysMax) errors.push(`Quantidade de dias: de ${GENERATOR_LIMITS.daysMin} a ${GENERATOR_LIMITS.daysMax}.`)
  for (const [label, n] of [['aula', c.nextLesson], ['estudo musical', c.nextMusic]] as const) {
    if (!Number.isInteger(n) || n < 1 || n > GENERATOR_LIMITS.numberMax) errors.push(`Número da próxima ${label}: de 1 a ${GENERATOR_LIMITS.numberMax}.`)
  }
  for (const [label, m, min] of [['aula', c.lessonMinutes, LESSON_BLOCKS.length], ['estudo musical', c.musicMinutes, MUSIC_BLOCKS.length]] as const) {
    if (!Number.isInteger(m) || m < min || m > GENERATOR_LIMITS.minutesMax) errors.push(`Duração da ${label}: de ${min} a ${GENERATOR_LIMITS.minutesMax} min.`)
  }
  return errors
}

/**
 * Reparte `total` minutos proporcionalmente ao modelo (soma exata, cada etapa >= 1).
 * Com o total do modelo (60), devolve exatamente as durações da tabela.
 */
export function scaleDurations(template: StepTemplate[], total: number): number[] {
  const base = template.reduce((n, s) => n + s.minutes, 0)
  const raw = template.map((s) => (s.minutes * total) / base)
  const out = raw.map((r) => Math.max(1, Math.floor(r)))
  let diff = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; diff > 0; k = (k + 1) % order.length, diff--) out[order[k].i]++
  for (let k = order.length - 1; diff < 0; k = (k - 1 + order.length) % order.length) {
    if (out[order[k].i] > 1) {
      out[order[k].i]--
      diff++
    }
  }
  return out
}

export const pad2 = (n: number) => String(n).padStart(2, '0')

const LESSON_RE = /^\s*aula\s+0*(\d+)\b/i
const MUSIC_RE = /^\s*estudo\s+musical\s+0*(\d+)\b/i

export function lessonItem(number: number, day: IsoDate, minutes: number): Omit<PreviewItem, 'status' | 'reason'> {
  const theme = LESSON_THEMES.find((t) => t.number === number)
  const durations = scaleDurations(LESSON_BLOCKS, minutes)
  return {
    kind: 'lesson',
    number,
    unplanned: !theme,
    generator_key: `lesson:${number}`,
    study_day: day,
    skill: 'lesson',
    title: `Aula ${pad2(number)} — ${theme ? theme.title : 'tema a definir'}`,
    description: theme ? `Aula ChatGPT. Conteúdos: ${theme.topics.join('; ')}.` : 'Aula ChatGPT sem tema planejado: edite o título e as etapas.',
    planned_minutes: minutes,
    steps: LESSON_BLOCKS.map((b, i) => ({
      title: b.title,
      description: theme ? theme.steps[i] : null,
      planned_minutes: durations[i],
    })),
  }
}

export function musicItem(number: number, day: IsoDate, minutes: number): Omit<PreviewItem, 'status' | 'reason'> {
  const theme = MUSIC_THEMES.find((t) => t.number === number)
  const durations = scaleDurations(MUSIC_BLOCKS, minutes)
  return {
    kind: 'music',
    number,
    unplanned: !theme,
    generator_key: `music:${number}`,
    study_day: day,
    skill: 'music',
    title: `Estudo Musical ${pad2(number)} — ${theme ? `${theme.song} (${theme.artist})` : 'música a definir'}`,
    description: theme ? `Estudo musical ChatGPT. Foco: ${theme.focus}. Música sugerida (editável); sem letra completa.` : 'Estudo musical sem música planejada: edite o título e as etapas.',
    planned_minutes: minutes,
    steps: MUSIC_BLOCKS.map((b, i) => ({
      title: b.title,
      description: theme ? theme.steps[i] : null,
      planned_minutes: durations[i],
    })),
  }
}

export function complementaryItems(day: IsoDate): Omit<PreviewItem, 'status' | 'reason'>[] {
  return (COMPLEMENTARY_BY_WEEKDAY[isoWeekday(day)] ?? []).map((c) => ({
    kind: 'complementary',
    number: null,
    unplanned: false,
    generator_key: `comp:${day}:${c.slug}`,
    study_day: day,
    skill: c.skill,
    title: `${c.title} — ${c.minutes} min`,
    description: c.description,
    planned_minutes: c.minutes,
    steps: [],
  }))
}

/** Monta a prévia na ordem de cada dia: aula, estudo musical, complementares. */
export function buildPreview(config: GeneratorConfig, ctx: GeneratorContext): PreviewItem[] {
  const keys = new Set(ctx.generatedKeys)
  const manual = ctx.activities.filter((a) => !a.generator_key)
  const usedNumber = (re: RegExp, skill: string, n: number) =>
    manual.find((a) => (a.skill === skill || re.test(a.title)) && Number(re.exec(a.title)?.[1]) === n)

  const items: PreviewItem[] = []
  for (let i = 0; i < config.days; i++) {
    const day = addDays(config.startDate, i)
    const base = [
      lessonItem(config.nextLesson + i, day, config.lessonMinutes),
      musicItem(config.nextMusic + i, day, config.musicMinutes),
      ...(config.includeComplementary ? complementaryItems(day) : []),
    ]
    for (const it of base) {
      let status: ItemStatus = 'new'
      let reason: string | null = null
      if (keys.has(it.generator_key)) {
        status = 'exists'
        reason = 'Já gerado anteriormente — não será duplicado.'
      } else if (it.kind === 'lesson' && usedNumber(LESSON_RE, 'lesson', it.number!)) {
        const a = usedNumber(LESSON_RE, 'lesson', it.number!)!
        status = 'conflict'
        reason = `Já existe "${a.title}" em ${a.study_day}.`
      } else if (it.kind === 'music' && usedNumber(MUSIC_RE, 'music', it.number!)) {
        const a = usedNumber(MUSIC_RE, 'music', it.number!)!
        status = 'conflict'
        reason = `Já existe "${a.title}" em ${a.study_day}.`
      } else {
        const sameDay = manual.find(
          (a) =>
            a.study_day === it.study_day &&
            (it.kind === 'complementary' ? a.title.trim().toLowerCase().startsWith(it.title.split(' — ')[0].toLowerCase()) : a.skill === it.skill),
        )
        if (sameDay) {
          status = 'conflict'
          reason = `Já existe "${sameDay.title}" neste dia.`
        }
      }
      items.push({ ...it, status, reason })
    }
  }
  return items
}

/** Remove os campos só de prévia, deixando o payload da RPC. */
export function toPayload(items: PreviewItem[]): GeneratorItemPayload[] {
  return items.map(({ generator_key, study_day, skill, title, description, planned_minutes, steps }) => ({
    generator_key,
    study_day,
    skill,
    title,
    description,
    planned_minutes,
    steps,
  }))
}
