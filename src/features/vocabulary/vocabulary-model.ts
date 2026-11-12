import type { Database } from '../../lib/database.types'

type Fns = Database['public']['Functions']

type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null }
/** O gerador de tipos marca colunas de RETURNS TABLE como não nulas; estas podem ser null. */
export type VocabularyRow = Nullable<
  Fns['list_vocabulary']['Returns'][number],
  'part_of_speech' | 'notes' | 'source_type' | 'source_ref' | 'next_review_at' | 'example_1' | 'example_2'
>
export type QueueCard = Fns['get_review_queue']['Returns'][number]
export type VocabularySummary = Omit<Fns['get_vocabulary_summary']['Returns'][number], 'server_now'> & {
  server_now: string
}
export type Rating = 'again' | 'hard' | 'good' | 'easy'
export type VocabularyFilter = 'all' | 'due' | 'new'

export const FILTERS: { value: VocabularyFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'due', label: 'Pendentes' },
  { value: 'new', label: 'Sem revisão' },
]

export const PART_OF_SPEECH: { value: string; label: string }[] = [
  { value: 'noun', label: 'Substantivo' },
  { value: 'verb', label: 'Verbo' },
  { value: 'adjective', label: 'Adjetivo' },
  { value: 'adverb', label: 'Advérbio' },
  { value: 'phrase', label: 'Expressão' },
  { value: 'other', label: 'Outro' },
]

export const LIMITS = { word: 120, translation: 240, example: 500, notes: 1000 } as const

export const PAGE_SIZE = 50

export interface VocabularyInput {
  word: string
  translation: string
  example1: string
  example2: string
  partOfSpeech: string
  notes: string
  /** '' = manual; 'lesson:<id>' | 'music:<id>' */
  source: string
}

export interface VocabularyValues {
  word: string
  translation: string
  example_1: string | null
  example_2: string | null
  part_of_speech: string | null
  notes: string | null
  source_type: 'manual' | 'lesson' | 'music'
  source_ref: string | null
}

export type VocabularyErrors = Partial<Record<keyof VocabularyInput, string>>

export const EMPTY_INPUT: VocabularyInput = {
  word: '',
  translation: '',
  example1: '',
  example2: '',
  partOfSpeech: '',
  notes: '',
  source: '',
}

function required(value: string, max: number, label: string): string | undefined {
  if (value.length === 0) return `Informe ${label}.`
  if (value.length > max) return `Use no máximo ${max} caracteres.`
  return undefined
}

/** Valida e normaliza (trim) — as mesmas regras das constraints do banco. */
export function validateVocabulary(input: VocabularyInput): { values: VocabularyValues | null; errors: VocabularyErrors } {
  const word = input.word.trim()
  const translation = input.translation.trim()
  const example1 = input.example1.trim()
  const example2 = input.example2.trim()
  const notes = input.notes.trim()

  const errors: VocabularyErrors = {}
  const e = {
    word: required(word, LIMITS.word, 'a palavra ou expressão'),
    translation: required(translation, LIMITS.translation, 'a tradução'),
    // Exemplos são opcionais (ET-008); vazio = sem exemplo.
    example1: example1.length > LIMITS.example ? `Use no máximo ${LIMITS.example} caracteres.` : undefined,
    example2: example2.length > LIMITS.example ? `Use no máximo ${LIMITS.example} caracteres.` : undefined,
    notes: notes.length > LIMITS.notes ? `Use no máximo ${LIMITS.notes} caracteres.` : undefined,
    partOfSpeech:
      input.partOfSpeech && !PART_OF_SPEECH.some((p) => p.value === input.partOfSpeech) ? 'Categoria inválida.' : undefined,
    source: input.source && !/^(lesson|music):[0-9a-f-]{36}$/.test(input.source) ? 'Origem inválida.' : undefined,
  }
  for (const [k, v] of Object.entries(e)) if (v) errors[k as keyof VocabularyInput] = v
  if (Object.keys(errors).length > 0) return { values: null, errors }

  const [type, ref] = input.source ? (input.source.split(':') as ['lesson' | 'music', string]) : ['manual' as const, null]
  return {
    values: {
      word,
      translation,
      example_1: example1 || null,
      example_2: example2 || null,
      part_of_speech: input.partOfSpeech || null,
      notes: notes || null,
      source_type: type,
      source_ref: ref,
    },
    errors,
  }
}

export function inputFromRow(row: VocabularyRow): VocabularyInput {
  return {
    word: row.word,
    translation: row.translation,
    example1: row.example_1 ?? '',
    example2: row.example_2 ?? '',
    partOfSpeech: row.part_of_speech ?? '',
    notes: row.notes ?? '',
    source: row.source_type && row.source_type !== 'manual' && row.source_ref ? `${row.source_type}:${row.source_ref}` : '',
  }
}

export type ReviewStatus = { kind: 'new' } | { kind: 'due'; since: string } | { kind: 'scheduled'; at: string }

export function reviewStatus(nextReviewAt: string | null, now: Date): ReviewStatus {
  if (!nextReviewAt) return { kind: 'new' }
  return new Date(nextReviewAt).getTime() <= now.getTime() ? { kind: 'due', since: nextReviewAt } : { kind: 'scheduled', at: nextReviewAt }
}
