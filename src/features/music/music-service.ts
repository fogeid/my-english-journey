import type { DbClient } from '../../lib/supabase-context'
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
  meaningRequired: 'Informe o significado.',
  sync: 'Não foi possível sincronizar com o vocabulário. Nada foi alterado; tente novamente.',
} as const

/** Resultado da sincronização de uma palavra do estudo com o vocabulário (ET-008). */
export type WordSyncResult = 'created' | 'linked' | 'pending' | 'already'
export interface SyncSummary {
  created: number
  linked: number
  pending: number
}

interface PgError {
  code?: string
  message?: string
}
function toError(error: PgError | null | undefined, fallback: string): MusicError {
  const m = error?.message ?? ''
  if (error?.code === '23505' && /music_studies_user_number_key/.test(m)) return new MusicError(MUSIC_MESSAGES.duplicateNumber, error)
  if (error?.code === '23505' && /music_words_study_term_key/.test(m)) return new MusicError(MUSIC_MESSAGES.duplicateWord, error)
  if (error?.code === '22023' && /meaning required/.test(m)) return new MusicError(MUSIC_MESSAGES.meaningRequired, error)
  return new MusicError(fallback, error)
}
function one(res: { data: unknown[] | null; error: PgError | null }, fallback: string) {
  if (res.error || !res.data || res.data.length !== 1) throw toError(res.error, fallback)
}
const SYNC_RESULTS: readonly string[] = ['created', 'linked', 'pending', 'already']
function syncResult(res: { data: string | null; error: PgError | null }): WordSyncResult {
  if (res.error || !res.data || !SYNC_RESULTS.includes(res.data)) throw toError(res.error, MUSIC_MESSAGES.save)
  return res.data as WordSyncResult
}

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
  /** Grava a palavra no estudo e sincroniza com o vocabulário na mesma transação (tudo ou nada). */
  addWord(studyId: string, values: WordValues): Promise<WordSyncResult>
  /** Corrige significado/trecho; se a palavra ainda não estiver no vocabulário, sincroniza. */
  updateWord(wordId: string, values: Pick<WordValues, 'meaning' | 'excerpt'>): Promise<WordSyncResult>
  /** Exclui só do estudo; o vocabulário é preservado. */
  removeWord(id: string): Promise<void>
  /** Sincroniza as palavras de estudos anteriores ainda fora do vocabulário (idempotente). */
  syncWords(): Promise<SyncSummary>
}

export function createSupabaseMusicService(client: DbClient): MusicService {
  return {
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
    async addWord(studyId, values) {
      return syncResult(
        await client.rpc('add_music_word', { p_study_id: studyId, p_term: values.term, p_meaning: values.meaning, ...(values.excerpt ? { p_excerpt: values.excerpt } : {}) }),
      )
    },
    async updateWord(wordId, values) {
      return syncResult(await client.rpc('update_music_word', { p_word_id: wordId, p_meaning: values.meaning, ...(values.excerpt ? { p_excerpt: values.excerpt } : {}) }))
    },
    async removeWord(id) {
      one(await client.from('music_words').delete().eq('id', id).select('id'), MUSIC_MESSAGES.save)
    },
    async syncWords() {
      const { data, error } = await client.rpc('sync_music_words')
      if (error || !data || data.length !== 1) throw toError(error, MUSIC_MESSAGES.sync)
      return data[0]
    },
  }
}
