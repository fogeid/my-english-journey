import type { MusicStudyDetail, MusicWordRow } from '../../src/features/music/music-model'
import { MUSIC_MESSAGES, MusicError, type MusicService, type WordSyncResult } from '../../src/features/music/music-service'

/** MusicService em memória (testes de interface). Integridade real: tests/rls/music-rls.test.ts. */
export function createFakeMusicService(existingVocabulary: string[] = []) {
  let seq = 0
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
  const studies: MusicStudyDetail[] = []
  const vocabulary: { id: string; word: string; translation: string; example_1: string | null }[] = existingVocabulary.map((word) => ({ id: id(), word, translation: 't', example_1: null }))
  let failNext = false
  /** Simula falha da transação no servidor: nada é gravado. */
  const failOnce = () => { failNext = true }
  const fail = (): never => {
    failNext = false
    throw new MusicError(MUSIC_MESSAGES.save)
  }
  /** Mesma regra de public.sync_music_word (a regra real é testada em tests/rls/music-vocabulary-sync-rls.test.ts). */
  const sync = (w: MusicWordRow): WordSyncResult => {
    if (w.vocabulary_id) return 'already'
    const existing = vocabulary.find((x) => norm(x.word) === norm(w.term))
    if (existing) {
      w.vocabulary_id = existing.id
      return 'linked'
    }
    if (!w.meaning) return 'pending'
    const v = { id: id(), word: w.term, translation: w.meaning, example_1: w.excerpt }
    vocabulary.push(v)
    w.vocabulary_id = v.id
    return 'created'
  }
  const calls: Record<string, unknown[][]> = {}
  const track = (n: keyof MusicService, args: unknown[]) => ((calls[n] ??= []).push(args), undefined)
  const find = (sid: string) => studies.find((s) => s.id === sid)!
  const now = () => new Date(Date.now() + seq).toISOString()
  const norm = (s: string) => s.trim().toLowerCase()

  const service: MusicService = {
    async list() {
      track('list', [])
      return [...studies].sort((a, b) => (b.study_number ?? 0) - (a.study_number ?? 0)).map((s) => ({ ...s }))
    },
    async get(sid) {
      track('get', [sid])
      const s = studies.find((x) => x.id === sid)
      return s ? (JSON.parse(JSON.stringify(s)) as MusicStudyDetail) : null
    },
    async create(userId, v) {
      track('create', [v])
      if (studies.some((s) => s.study_number === v.study_number)) throw new MusicError(MUSIC_MESSAGES.duplicateNumber)
      const sid = id()
      studies.push({
        id: sid, user_id: userId, created_at: now(), status: 'in_progress', initial_score: null, final_score: null,
        initial_comprehension: null, final_comprehension: null, difficulties: [], source_key: null, music_activities: [], music_words: [], ...v,
      })
      return sid
    },
    async update(sid, v) {
      track('update', [sid, v])
      Object.assign(find(sid), v)
    },
    async setStatus(sid, status) {
      track('setStatus', [sid, status])
      find(sid).status = status
    },
    async setComprehension(sid, which, v) {
      track('setComprehension', [sid, which, v])
      Object.assign(find(sid), which === 'initial' ? { initial_score: v.score, initial_comprehension: v.comment } : { final_score: v.score, final_comprehension: v.comment })
    },
    async remove(sid) {
      track('remove', [sid])
      studies.splice(studies.findIndex((s) => s.id === sid), 1)
    },
    async saveActivity(userId, sid, type, v) {
      track('saveActivity', [sid, type, v])
      const s = find(sid)
      const a = s.music_activities.find((x) => x.activity_type === type)
      if (a) Object.assign(a, v)
      else s.music_activities.push({ id: id(), user_id: userId, music_study_id: sid, activity_type: type, created_at: now(), updated_at: now(), ...v })
    },
    async addWord(sid, v) {
      track('addWord', [sid, v])
      if (failNext) return fail()
      const s = find(sid)
      if (s.music_words.some((w) => norm(w.term) === norm(v.term))) throw new MusicError(MUSIC_MESSAGES.duplicateWord)
      const w = { id: id(), user_id: s.user_id, music_study_id: sid, vocabulary_id: null, created_at: now(), ...v }
      s.music_words.push(w)
      return sync(w)
    },
    async updateWord(wid, v) {
      track('updateWord', [wid, v])
      if (failNext) return fail()
      const w = studies.flatMap((s) => s.music_words).find((x) => x.id === wid)!
      Object.assign(w, v)
      return sync(w)
    },
    async removeWord(wid) {
      track('removeWord', [wid])
      for (const s of studies) s.music_words = s.music_words.filter((w) => w.id !== wid)
    },
    async syncWords() {
      track('syncWords', [])
      if (failNext) return fail()
      const r = { created: 0, linked: 0, pending: 0 }
      for (const w of studies.flatMap((s) => s.music_words)) {
        if (w.vocabulary_id) continue
        const res = sync(w)
        if (res !== 'already') r[res]++
      }
      return r
    },
  }
  return { service, studies, vocabulary, calls, failOnce }
}
