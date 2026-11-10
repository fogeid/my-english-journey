import type { DbClient } from '../../lib/supabase-context'
import type { QueueCard, Rating, VocabularyFilter, VocabularyRow, VocabularySummary, VocabularyValues } from './vocabulary-model'

export class VocabularyError extends Error {
  readonly userMessage: string
  constructor(userMessage: string, cause?: unknown) {
    super(userMessage, { cause })
    this.name = 'VocabularyError'
    this.userMessage = userMessage
  }
}

export const VOCAB_MESSAGES = {
  load: 'Não foi possível carregar o vocabulário. Verifique sua conexão e tente novamente.',
  save: 'Não foi possível salvar. Verifique sua conexão e tente novamente.',
  duplicate: 'Esta palavra já está cadastrada. Use a busca para encontrá-la e editar o registro existente.',
  history: 'Esta palavra já tem revisões registradas e não pode ser excluída (histórico preservado).',
  review: 'Não foi possível registrar a revisão. Nada foi salvo; tente novamente.',
  queue: 'Não foi possível carregar a fila de revisões.',
  summary: 'Não foi possível carregar o resumo do vocabulário.',
} as const

interface PgError {
  code?: string
  message?: string
}

function toError(error: PgError | null | undefined, fallback: string): VocabularyError {
  if (error?.code === '23505') return new VocabularyError(VOCAB_MESSAGES.duplicate, error)
  if (error?.code === '23503' && /vocabulary_reviews/.test(error.message ?? '')) return new VocabularyError(VOCAB_MESSAGES.history, error)
  return new VocabularyError(fallback, error)
}

export interface SourceOption {
  value: string // 'lesson:<id>' | 'music:<id>'
  label: string
}

export interface VocabularyService {
  list(params: { search: string; filter: VocabularyFilter; limit: number; offset: number }): Promise<{ rows: VocabularyRow[]; total: number }>
  summary(): Promise<VocabularySummary>
  sources(): Promise<SourceOption[]>
  create(userId: string, values: VocabularyValues): Promise<void>
  update(id: string, values: VocabularyValues): Promise<void>
  remove(id: string): Promise<void>
  queue(limit?: number): Promise<QueueCard[]>
  review(vocabularyId: string, rating: Rating, requestId: string): Promise<{ next_review_at: string | null; interval_minutes: number | null }>
}

export function createSupabaseVocabularyService(client: DbClient): VocabularyService {
  return {
    async list({ search, filter, limit, offset }) {
      const { data, error } = await client.rpc('list_vocabulary', {
        p_search: search,
        p_filter: filter,
        p_limit: limit,
        p_offset: offset,
      })
      if (error || !data) throw toError(error, VOCAB_MESSAGES.load)
      return { rows: data, total: data.length > 0 ? Number(data[0].total_count) : 0 }
    },

    async summary() {
      const { data, error } = await client.rpc('get_vocabulary_summary')
      if (error || !data || data.length !== 1) throw toError(error, VOCAB_MESSAGES.summary)
      return data[0]
    },

    async sources() {
      const [lessons, music] = await Promise.all([
        client.from('lessons').select('id, lesson_number, studied_on').order('lesson_number'),
        client.from('music_studies').select('id, song, artist').order('song'),
      ])
      if (lessons.error || music.error) throw toError(lessons.error ?? music.error, VOCAB_MESSAGES.load)
      return [
        ...lessons.data.map((l) => ({ value: `lesson:${l.id}`, label: `Aula ${l.lesson_number}` })),
        ...music.data.map((m) => ({ value: `music:${m.id}`, label: `Música: ${m.song} — ${m.artist}` })),
      ]
    },

    async create(userId, values) {
      const { error } = await client.from('vocabulary').insert({ user_id: userId, ...values })
      if (error) throw toError(error, VOCAB_MESSAGES.save)
    },

    async update(id, values) {
      const { data, error } = await client.from('vocabulary').update(values).eq('id', id).select('id')
      if (error || !data || data.length !== 1) throw toError(error, VOCAB_MESSAGES.save)
    },

    async remove(id) {
      const { data, error } = await client.from('vocabulary').delete().eq('id', id).select('id')
      if (error || !data || data.length !== 1) throw toError(error, VOCAB_MESSAGES.save)
    },

    async queue(limit = 20) {
      const { data, error } = await client.rpc('get_review_queue', { p_limit: limit })
      if (error || !data) throw toError(error, VOCAB_MESSAGES.queue)
      return data
    },

    async review(vocabularyId, rating, requestId) {
      const { data, error } = await client.rpc('review_vocabulary', {
        p_vocabulary_id: vocabularyId,
        p_rating: rating,
        p_request_id: requestId,
      })
      if (error || !data) throw toError(error, VOCAB_MESSAGES.review)
      return { next_review_at: data.next_review_at, interval_minutes: data.interval_minutes }
    },
  }
}
