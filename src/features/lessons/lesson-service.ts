import type { DbClient } from '../../lib/supabase-context'
import type { BlockType, ExerciseValues, LessonDetail, LessonStatus, LessonSummary, LessonValues } from './lesson-model'

export class LessonError extends Error {
  readonly userMessage: string
  constructor(userMessage: string, cause?: unknown) {
    super(userMessage, { cause })
    this.name = 'LessonError'
    this.userMessage = userMessage
  }
}

export const LESSON_MESSAGES = {
  load: 'Não foi possível carregar as aulas. Verifique sua conexão e tente novamente.',
  loadOne: 'Não foi possível carregar esta aula.',
  notFound: 'Aula não encontrada.',
  save: 'Não foi possível salvar. Verifique sua conexão e tente novamente.',
  duplicateNumber: 'Já existe uma aula com este número.',
  duplicateBlock: 'Este bloco já existe nesta aula.',
} as const

interface PgError {
  code?: string
  message?: string
}

function toError(error: PgError | null | undefined, fallback: string): LessonError {
  if (error?.code === '23505' && /lesson_number/.test(error.message ?? '')) return new LessonError(LESSON_MESSAGES.duplicateNumber, error)
  if (error?.code === '23505' && /block_type/.test(error.message ?? '')) return new LessonError(LESSON_MESSAGES.duplicateBlock, error)
  return new LessonError(fallback, error)
}

export interface LessonService {
  list(): Promise<LessonSummary[]>
  get(id: string): Promise<LessonDetail | null>
  create(userId: string, values: LessonValues): Promise<string>
  update(id: string, values: Partial<LessonValues> & { difficulties?: string | null; recommendations?: string | null }): Promise<void>
  setStatus(id: string, status: LessonStatus): Promise<void>
  remove(id: string): Promise<void>
  addBlock(userId: string, lessonId: string, type: BlockType): Promise<void>
  updateBlock(id: string, values: { score: number | null; notes: string | null }): Promise<void>
  removeBlock(id: string): Promise<void>
  addExercise(userId: string, blockId: string, values: ExerciseValues): Promise<void>
  updateExercise(id: string, values: ExerciseValues): Promise<void>
  removeExercise(id: string): Promise<void>
}

/** Garante que exatamente uma linha foi afetada (RLS devolve 0 linhas para registros alheios). */
function one(res: { data: unknown[] | null; error: PgError | null }, fallback: string) {
  if (res.error || !res.data || res.data.length !== 1) throw toError(res.error, fallback)
}

export function createSupabaseLessonService(client: DbClient): LessonService {
  return {
    async list() {
      const { data, error } = await client
        .from('lessons')
        .select('id, lesson_number, title, studied_on, level, status, topics, lesson_blocks(block_type, score)')
        .order('lesson_number', { ascending: false })
      if (error || !data) throw toError(error, LESSON_MESSAGES.load)
      return data
    },

    async get(id) {
      const { data, error } = await client
        .from('lessons')
        .select('*, lesson_blocks(*, lesson_exercises(*))')
        .eq('id', id)
        .maybeSingle()
      if (error) throw toError(error, LESSON_MESSAGES.loadOne)
      if (!data) return null
      for (const b of data.lesson_blocks) {
        b.lesson_exercises.sort((x, y) => x.created_at.localeCompare(y.created_at) || x.id.localeCompare(y.id))
      }
      return data
    },

    async create(userId, values) {
      const { data, error } = await client.from('lessons').insert({ user_id: userId, ...values }).select('id').single()
      if (error || !data) throw toError(error, LESSON_MESSAGES.save)
      return data.id
    },

    async update(id, values) {
      one(await client.from('lessons').update(values).eq('id', id).select('id'), LESSON_MESSAGES.save)
    },

    async setStatus(id, status) {
      one(await client.from('lessons').update({ status }).eq('id', id).select('id'), LESSON_MESSAGES.save)
    },

    async remove(id) {
      one(await client.from('lessons').delete().eq('id', id).select('id'), LESSON_MESSAGES.save)
    },

    async addBlock(userId, lessonId, type) {
      const { error } = await client.from('lesson_blocks').insert({ user_id: userId, lesson_id: lessonId, block_type: type })
      if (error) throw toError(error, LESSON_MESSAGES.save)
    },

    async updateBlock(id, values) {
      one(await client.from('lesson_blocks').update(values).eq('id', id).select('id'), LESSON_MESSAGES.save)
    },

    async removeBlock(id) {
      one(await client.from('lesson_blocks').delete().eq('id', id).select('id'), LESSON_MESSAGES.save)
    },

    async addExercise(userId, blockId, values) {
      const { error } = await client.from('lesson_exercises').insert({ user_id: userId, block_id: blockId, ...values })
      if (error) throw toError(error, LESSON_MESSAGES.save)
    },

    async updateExercise(id, values) {
      one(await client.from('lesson_exercises').update(values).eq('id', id).select('id'), LESSON_MESSAGES.save)
    },

    async removeExercise(id) {
      one(await client.from('lesson_exercises').delete().eq('id', id).select('id'), LESSON_MESSAGES.save)
    },
  }
}
