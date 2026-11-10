import type { Database } from '../../lib/database.types'

type Tables = Database['public']['Tables']
export type LessonRow = Tables['lessons']['Row']
export type BlockRow = Tables['lesson_blocks']['Row']
export type ExerciseRow = Tables['lesson_exercises']['Row']

export type LessonStatus = 'in_progress' | 'completed'
export type BlockType = 'grammar' | 'vocabulary' | 'listening' | 'speaking' | 'reading' | 'writing' | 'review'

export interface LessonSummary {
  id: string
  lesson_number: number
  title: string | null
  studied_on: string | null
  level: string | null
  status: string
  topics: string[]
  lesson_blocks: { block_type: string; score: number | null }[]
}

export interface BlockWithExercises extends BlockRow {
  lesson_exercises: ExerciseRow[]
}
export interface LessonDetail extends LessonRow {
  lesson_blocks: BlockWithExercises[]
}

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

/** Ordem canônica dos blocos (também usada para exibição). */
export const BLOCK_TYPES: { value: BlockType; label: string }[] = [
  { value: 'grammar', label: 'Gramática' },
  { value: 'vocabulary', label: 'Vocabulário' },
  { value: 'listening', label: 'Listening' },
  { value: 'speaking', label: 'Speaking' },
  { value: 'reading', label: 'Reading' },
  { value: 'writing', label: 'Writing' },
  { value: 'review', label: 'Revisão' },
]
export const blockLabel = (t: string) => BLOCK_TYPES.find((b) => b.value === t)?.label ?? t
export const sortBlocks = <T extends { block_type: string }>(blocks: T[]) =>
  [...blocks].sort((a, b) => BLOCK_TYPES.findIndex((x) => x.value === a.block_type) - BLOCK_TYPES.findIndex((x) => x.value === b.block_type))

export const STATUS_LABEL: Record<string, string> = { in_progress: 'Em andamento', completed: 'Concluída' }

export const LIMITS = { title: 200, topic: 100, topics: 30, long: 5000, blockNotes: 2000, exercise: 4000 } as const

/**
 * NOTA GERAL DA AULA — regra única do app:
 * média aritmética simples das notas (0–10) dos blocos que têm nota, arredondada para 1 casa decimal.
 * Blocos sem nota não entram. Sem nenhum bloco avaliado, a aula não tem nota geral (null).
 */
export function overallScore(blocks: { score: number | null }[]): number | null {
  const scored = blocks.map((b) => b.score).filter((s): s is number => s !== null && s !== undefined)
  if (scored.length === 0) return null
  const mean = scored.reduce((a, b) => a + Number(b), 0) / scored.length
  return Math.round(mean * 10 + Number.EPSILON) / 10
}

export const formatScore = (s: number | null) => (s === null ? '—' : s.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))

/** "8,5" ou "8.5" → 8.5; vazio → null; inválido → undefined. Faixa 0–10, 1 casa decimal. */
export function parseScore(raw: string): number | null | undefined {
  const s = raw.trim().replace(',', '.')
  if (s === '') return null
  if (!/^\d{1,2}(\.\d)?$/.test(s)) return undefined
  const n = Number(s)
  return n >= 0 && n <= 10 ? n : undefined
}

/** Assuntos: um por linha ou separados por vírgula; trim, sem vazios, sem repetidos. */
export function parseTopics(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of raw.split(/[\n,]/).map((x) => x.trim()).filter(Boolean)) {
    const key = t.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(t)
    }
  }
  return out
}

// ---------- Aula ----------
export interface LessonInput {
  lessonNumber: string
  title: string
  studiedOn: string
  level: string
  topics: string
  report: string
}
export interface LessonValues {
  lesson_number: number
  title: string
  studied_on: string
  level: string
  topics: string[]
  report: string | null
}
export type LessonErrors = Partial<Record<keyof LessonInput, string>>

export function validateLesson(input: LessonInput): { values: LessonValues | null; errors: LessonErrors } {
  const errors: LessonErrors = {}
  const num = input.lessonNumber.trim()
  if (!/^\d{1,6}$/.test(num) || Number(num) < 1) errors.lessonNumber = 'Informe um número inteiro maior que zero.'
  const title = input.title.trim()
  if (!title) errors.title = 'Informe o título da aula.'
  else if (title.length > LIMITS.title) errors.title = `Use no máximo ${LIMITS.title} caracteres.`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.studiedOn) || Number.isNaN(Date.parse(`${input.studiedOn}T00:00:00Z`))) {
    errors.studiedOn = 'Informe a data da aula.'
  }
  if (!(LEVELS as readonly string[]).includes(input.level)) errors.level = 'Escolha o nível.'
  const topics = parseTopics(input.topics)
  if (topics.length > LIMITS.topics) errors.topics = `No máximo ${LIMITS.topics} assuntos.`
  else if (topics.some((t) => t.length > LIMITS.topic)) errors.topics = `Cada assunto pode ter até ${LIMITS.topic} caracteres.`
  const report = input.report.trim()
  if (report.length > LIMITS.long) errors.report = `Use no máximo ${LIMITS.long} caracteres.`
  if (Object.keys(errors).length) return { values: null, errors }
  return {
    values: { lesson_number: Number(num), title, studied_on: input.studiedOn, level: input.level, topics, report: report || null },
    errors,
  }
}

// ---------- Exercício ----------
export interface ExerciseInput {
  prompt: string
  myAnswer: string
  correctedAnswer: string
  explanation: string
}
export interface ExerciseValues {
  prompt: string
  my_answer: string | null
  corrected_answer: string | null
  explanation: string | null
}
export type ExerciseErrors = Partial<Record<keyof ExerciseInput, string>>

export function validateExercise(input: ExerciseInput): { values: ExerciseValues | null; errors: ExerciseErrors } {
  const errors: ExerciseErrors = {}
  const v = {
    prompt: input.prompt.trim(),
    my_answer: input.myAnswer.trim(),
    corrected_answer: input.correctedAnswer.trim(),
    explanation: input.explanation.trim(),
  }
  if (!v.prompt) errors.prompt = 'Informe o enunciado.'
  const keys: [keyof ExerciseInput, string][] = [
    ['prompt', v.prompt],
    ['myAnswer', v.my_answer],
    ['correctedAnswer', v.corrected_answer],
    ['explanation', v.explanation],
  ]
  for (const [k, val] of keys) if (val.length > LIMITS.exercise) errors[k] = `Use no máximo ${LIMITS.exercise} caracteres.`
  if (Object.keys(errors).length) return { values: null, errors }
  return {
    values: { prompt: v.prompt, my_answer: v.my_answer || null, corrected_answer: v.corrected_answer || null, explanation: v.explanation || null },
    errors,
  }
}
