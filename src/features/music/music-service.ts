import type { DbClient } from '../../lib/supabase-context'
import type { VocabularyValues } from '../vocabulary/vocabulary-model'
import type { ActivityType, ActivityValues, MusicStudyDetail, MusicStudySummary, StudyValues, WordValues } from './music-model'

export class MusicError extends Error {
  readonly userMessage: string
  constructor(userMessage: string, cause?: unknown) {
    super(userMessage, { cause })
    this.name = 'MusicError'
    this.userMessage = userMessage
  }
}

export const MUSIC_MESSAGES = {
  load: 'Não foi possível carregar os estudos musicais. Verifique sua conexão e tente novamente.',
  loadOne: 'Não foi possível carregar este estudo.',
  notFound: 'Estudo musical não encontrado.',
  save: 'Não foi possível salvar. Verifique sua conexão e tente novamente.',
  duplicateNumber: 'Já existe um estudo com este número.',
  duplicateWord: 'Esta palavra já foi registrada neste estudo.',
  vocabularyDuplicate: 'Esta palavra já está no seu vocabulário.',
} as const

interface PgError {
  code?: string
  message?: string
}
function toError(error: PgError | null | undefined, fallback: string): MusicError {
  const m = error?.message ?? ''
  if (error?.code === '23505' && /music_studies_user_number_key/.test(m)) return new MusicError(MUSIC_MESSAGES.duplicateNumber, error)
  if (error?.code === '23505' && /music_words_study_term_key/.test(m)) return new MusicError(MUSIC_MESSAGES.duplicateWord, error)
  if (error?.code === '23505' && /vocabulary_user/.test(m)) return new MusicError(MUSIC_MESSAGES.vocabularyDuplicate, error)
  return new MusicError(fallback, error)
}
function one(res: { data: unknown[] | null; error: PgError | null }, fallback: string) {
  if (res.error || !res.data || res.data.length !== 1) throw toError(res.error, fallback)
}

/** ILIKE sem curingas = comparação exata sem diferenciar maiúsculas (mesma regra da unicidade da ET-003). */
const exactPattern = (s: string) => s.trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')

export interface MusicService {
  list(): Promise<MusicStudySummary[]>
  get(id: string): Promise<MusicStudyDetail | null>
  create(userId: string, values: StudyValues): Promise<string>
  update(id: string, values: Partial<StudyValues>): Promise<void>
  setStatus(id: string, status: 'in_progress' | 'completed'): Promise<void>
  setComprehension(id: string, which: 'initial' | 'final', value: { score: number | null; comment: string | null }): Promise<void>
  remove(id: string): Promise<void>
  /** Cria ou atualiza a atividade do tipo (no máximo uma por tipo e estudo). */
  saveActivity(userId: string, studyId: string, type: ActivityType, values: ActivityValues): Promise<void>
  addWord(userId: string, studyId: string, values: WordValues): Promise<void>
  removeWord(id: string): Promise<void>
  /** Palavra já existente no vocabulário (mesma regra de duplicata da ET-003), se houver. */
  findVocabulary(term: string): Promise<{ id: string; word: string } | null>
  linkWord(wordId: string, vocabularyId: string): Promise<void>
  /** Cria a palavra no vocabulário (origem = este estudo) e vincula. Nunca duplica. */
  addToVocabulary(userId: string, wordId: string, values: VocabularyValues): Promise<void>
}

export function createSupabaseMusicService(client: DbClient): MusicService {
  const svc: MusicService = {
    async list() {
      const { data, error } = await client
        .from('music_studies')
        .select('id, study_number, song, artist, studied_on, level, status, initial_score, final_score')
        .order('study_number', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error || !data) throw toError(error, MUSIC_MESSAGES.load)
      return data
    },
    async get(id) {
      const { data, error } = await client.from('music_studies').select('*, music_activities(*), music_words(*)').eq('id', id).maybeSingle()
      if (error) throw toError(error, MUSIC_MESSAGES.loadOne)
      if (!data) return null
      data.music_words.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      return data
    },
    async create(userId, values) {
      const { data, error } = await client.from('music_studies').insert({ user_id: userId, ...values }).select('id').single()
      if (error || !data) throw toError(error, MUSIC_MESSAGES.save)
      return data.id
    },
    async update(id, values) {
      one(await client.from('music_studies').update(values).eq('id', id).select('id'), MUSIC_MESSAGES.save)
    },
    async setStatus(id, status) {
      one(await client.from('music_studies').update({ status }).eq('id', id).select('id'), MUSIC_MESSAGES.save)
    },
    async setComprehension(id, which, v) {
      const patch = which === 'initial' ? { initial_score: v.score, initial_comprehension: v.comment } : { final_score: v.score, final_comprehension: v.comment }
      one(await client.from('music_studies').update(patch).eq('id', id).select('id'), MUSIC_MESSAGES.save)
    },
    async remove(id) {
      one(await client.from('music_studies').delete().eq('id', id).select('id'), MUSIC_MESSAGES.save)
    },
    async saveActivity(userId, studyId, type, values) {
      const { error } = await client
        .from('music_activities')
        .upsert({ user_id: userId, music_study_id: studyId, activity_type: type, ...values, updated_at: new Date().toISOString() }, { onConflict: 'music_study_id,activity_type' })
      if (error) throw toError(error, MUSIC_MESSAGES.save)
    },
    async addWord(userId, studyId, values) {
      const { error } = await client.from('music_words').insert({ user_id: userId, music_study_id: studyId, ...values })
      if (error) throw toError(error, MUSIC_MESSAGES.save)
    },
    async removeWord(id) {
      one(await client.from('music_words').delete().eq('id', id).select('id'), MUSIC_MESSAGES.save)
    },
    async findVocabulary(term) {
      const { data, error } = await client.from('vocabulary').select('id, word').ilike('word', exactPattern(term)).limit(1)
      if (error) throw toError(error, MUSIC_MESSAGES.load)
      return data[0] ?? null
    },
    async linkWord(wordId, vocabularyId) {
      one(await client.from('music_words').update({ vocabulary_id: vocabularyId }).eq('id', wordId).select('id'), MUSIC_MESSAGES.save)
    },
    async addToVocabulary(userId, wordId, values) {
      const { data, error } = await client.from('vocabulary').insert({ user_id: userId, ...values }).select('id').single()
      if (error || !data) throw toError(error, MUSIC_MESSAGES.save)
      await svc.linkWord(wordId, data.id)
    },
  }
  return svc
}
