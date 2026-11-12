import type { Database } from '../../lib/database.types'
import { LEVELS, parseScore } from '../lessons/lesson-model'

type Tables = Database['public']['Tables']
export type MusicStudyRow = Tables['music_studies']['Row']
export type MusicActivityRow = Tables['music_activities']['Row']
export type MusicWordRow = Tables['music_words']['Row']

export interface MusicStudyDetail extends MusicStudyRow {
  music_activities: MusicActivityRow[]
  music_words: MusicWordRow[]
}
export type MusicStudySummary = Pick<
  MusicStudyRow,
  'id' | 'study_number' | 'song' | 'artist' | 'studied_on' | 'level' | 'status' | 'initial_score' | 'final_score'
>

export type ActivityType = 'first_listening' | 'vocabulary' | 'translation' | 'pronunciation' | 'final_listening'

/** As 5 atividades fixas, na ordem do estudo. */
export const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'first_listening', label: 'Primeira escuta e compreensão inicial' },
  { value: 'vocabulary', label: 'Vocabulário e expressões' },
  { value: 'translation', label: 'Tradução e interpretação de trechos curtos' },
  { value: 'pronunciation', label: 'Pronúncia e reconhecimento auditivo' },
  { value: 'final_listening', label: 'Escuta final e avaliação da evolução' },
]
export const activityLabel = (t: string) => ACTIVITY_TYPES.find((a) => a.value === t)?.label ?? t

export const ACTIVITY_FIELDS = [
  { key: 'my_answers', label: 'Minhas respostas' },
  { key: 'difficulties', label: 'Dificuldades' },
  { key: 'corrections', label: 'Correções' },
  { key: 'explanations', label: 'Explicações' },
  { key: 'notes', label: 'Observações' },
] as const
export type ActivityField = (typeof ACTIVITY_FIELDS)[number]['key']
export type ActivityValues = Record<ActivityField, string | null>

/** "estudo" é masculino: rótulos próprios (as aulas usam "Concluída"). */
export const MUSIC_STATUS_LABEL: Record<string, string> = { in_progress: 'Em andamento', completed: 'Concluído' }

export const MUSIC_LIMITS = { name: 200, report: 5000, comprehension: 2000, activityField: 2000, term: 120, meaning: 240, excerpt: 300 } as const

export const COPYRIGHT_NOTE =
  'Registre apenas anotações e trechos curtos digitados por você. Não cole a letra completa da música; o app não armazena áudio nem letras.'

const toNum = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v))

/** Diferença final − inicial (1 casa decimal); null se faltar alguma das avaliações. */
export function comprehensionDelta(initial: number | null, final: number | null): number | null {
  const i = toNum(initial)
  const f = toNum(final)
  if (i === null || f === null) return null
  return Math.round((f - i) * 10 + (f >= i ? Number.EPSILON : -Number.EPSILON)) / 10
}

export function formatDelta(d: number | null): string {
  if (d === null) return '—'
  const abs = Math.abs(d).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return d > 0 ? `+${abs}` : d < 0 ? `−${abs}` : '0,0'
}

// ---------- Estudo ----------
export interface StudyInput {
  studyNumber: string
  song: string
  artist: string
  studiedOn: string
  level: string
  report: string
}
export interface StudyValues {
  study_number: number
  song: string
  artist: string
  studied_on: string
  level: string
  report: string | null
}
export type StudyErrors = Partial<Record<keyof StudyInput, string>>

export function validateStudy(input: StudyInput): { values: StudyValues | null; errors: StudyErrors } {
  const errors: StudyErrors = {}
  const n = input.studyNumber.trim()
  if (!/^\d{1,6}$/.test(n) || Number(n) < 1) errors.studyNumber = 'Informe um número inteiro maior que zero.'
  const song = input.song.trim()
  const artist = input.artist.trim()
  if (!song) errors.song = 'Informe o nome da música.'
  else if (song.length > MUSIC_LIMITS.name) errors.song = `Use no máximo ${MUSIC_LIMITS.name} caracteres.`
  if (!artist) errors.artist = 'Informe o artista.'
  else if (artist.length > MUSIC_LIMITS.name) errors.artist = `Use no máximo ${MUSIC_LIMITS.name} caracteres.`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.studiedOn) || Number.isNaN(Date.parse(`${input.studiedOn}T00:00:00Z`))) errors.studiedOn = 'Informe a data.'
  if (!(LEVELS as readonly string[]).includes(input.level)) errors.level = 'Escolha o nível.'
  const report = input.report.trim()
  if (report.length > MUSIC_LIMITS.report) errors.report = `Use no máximo ${MUSIC_LIMITS.report} caracteres.`
  if (Object.keys(errors).length) return { values: null, errors }
  return { values: { study_number: Number(n), song, artist, studied_on: input.studiedOn, level: input.level, report: report || null }, errors }
}

// ---------- Avaliação de compreensão ----------
export interface ComprehensionInput {
  score: string
  comment: string
}
export function validateComprehension(input: ComprehensionInput): { value: { score: number | null; comment: string | null } | null; error: string | null } {
  const score = parseScore(input.score)
  if (score === undefined) return { value: null, error: 'Use um número de 0 a 10, com até 1 casa decimal (ex.: 6,5).' }
  const comment = input.comment.trim()
  if (comment.length > MUSIC_LIMITS.comprehension) return { value: null, error: `Comentário com no máximo ${MUSIC_LIMITS.comprehension} caracteres.` }
  return { value: { score, comment: comment || null }, error: null }
}

// ---------- Atividade ----------
export function validateActivity(input: Record<ActivityField, string>): { values: ActivityValues | null; error: string | null } {
  const values = {} as ActivityValues
  for (const { key } of ACTIVITY_FIELDS) {
    const v = input[key].trim()
    if (v.length > MUSIC_LIMITS.activityField) return { values: null, error: `Cada campo pode ter até ${MUSIC_LIMITS.activityField} caracteres (use trechos curtos).` }
    values[key] = v || null
  }
  if (Object.values(values).every((v) => v === null)) return { values: null, error: 'Preencha ao menos um campo.' }
  return { values, error: null }
}

// ---------- Palavra do estudo ----------
export interface WordInput {
  term: string
  meaning: string
  excerpt: string
}
export interface WordValues {
  term: string
  meaning: string
  excerpt: string | null
}
export type WordErrors = Partial<Record<keyof WordInput, string>>

export function validateWord(input: WordInput): { values: WordValues | null; errors: WordErrors } {
  const errors: WordErrors = {}
  const term = input.term.trim()
  const meaning = input.meaning.trim()
  const excerpt = input.excerpt.trim()
  if (!term) errors.term = 'Informe a palavra ou expressão.'
  else if (term.length > MUSIC_LIMITS.term) errors.term = `Use no máximo ${MUSIC_LIMITS.term} caracteres.`
  if (!meaning) errors.meaning = 'Informe o significado.'
  else if (meaning.length > MUSIC_LIMITS.meaning) errors.meaning = `Use no máximo ${MUSIC_LIMITS.meaning} caracteres.`
  if (excerpt.length > MUSIC_LIMITS.excerpt) errors.excerpt = `Trecho curto: no máximo ${MUSIC_LIMITS.excerpt} caracteres.`
  if (Object.keys(errors).length) return { values: null, errors }
  return { values: { term, meaning, excerpt: excerpt || null }, errors }
}
