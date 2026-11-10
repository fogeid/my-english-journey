import type { QueueCard, VocabularyRow } from '../../src/features/vocabulary/vocabulary-model'
import { VOCAB_MESSAGES, VocabularyError, type VocabularyService } from '../../src/features/vocabulary/vocabulary-service'
import { previewIntervalMinutes, previewStreakAfter } from '../../src/features/reviews/review-schedule'

type Word = VocabularyRow & { review_streak: number }

/**
 * VocabularyService em memória para testes de interface. Espelha os contratos do banco
 * (validados de verdade em tests/rls/vocabulary-rls.test.ts): unicidade normalizada,
 * exclusão bloqueada com histórico, idempotência por request_id, fila vencidas → novas.
 */
export function createFakeVocabularyService(seed: Partial<Word>[] = []) {
  let seq = 0
  let now = new Date('2026-11-10T15:00:00Z').getTime()
  const words: Word[] = []
  const reviews: { requestId: string; vocabularyId: string; rating: string; minutes: number }[] = []
  const calls: Record<string, unknown[][]> = {}
  const failures = new Set<keyof VocabularyService>()

  const track = (name: keyof VocabularyService, args: unknown[]) => {
    ;(calls[name] ??= []).push(args)
    if (failures.has(name)) throw new VocabularyError(name === 'review' ? VOCAB_MESSAGES.review : VOCAB_MESSAGES.load)
  }
  const add = (w: Partial<Word>) => {
    const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
    words.push({
      id,
      word: 'word',
      translation: 't',
      part_of_speech: null,
      example_1: 'e1',
      example_2: 'e2',
      notes: null,
      source_type: 'manual',
      source_ref: null,
      next_review_at: null,
      review_count: 0,
      review_streak: 0,
      created_at: new Date(now + seq).toISOString(),
      total_count: 0,
      ...w,
    })
  }
  seed.forEach(add)
  const isDue = (w: Word) => w.next_review_at !== null && new Date(w.next_review_at).getTime() <= now
  const norm = (s: string) => s.trim().toLowerCase()

  const service: VocabularyService = {
    async list({ search, filter, limit, offset }) {
      track('list', [{ search, filter, limit, offset }])
      const q = search.trim().toLowerCase()
      const all = words
        .filter((w) => !q || w.word.toLowerCase().includes(q) || w.translation.toLowerCase().includes(q))
        .filter((w) => filter === 'all' || (filter === 'due' ? isDue(w) : w.next_review_at === null))
        .sort((a, b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase()) || a.id.localeCompare(b.id))
      return { rows: all.slice(offset, offset + limit).map((w) => ({ ...w, total_count: all.length })), total: all.length }
    },
    async summary() {
      track('summary', [])
      return {
        total: words.length,
        due: words.filter(isDue).length,
        new_words: words.filter((w) => w.next_review_at === null).length,
        server_now: new Date(now).toISOString(),
      }
    },
    async sources() {
      track('sources', [])
      return []
    },
    async create(_userId, v) {
      track('create', [v])
      if (words.some((w) => norm(w.word) === norm(v.word))) throw new VocabularyError(VOCAB_MESSAGES.duplicate)
      add({ ...v })
    },
    async update(id, v) {
      track('update', [id, v])
      if (words.some((w) => w.id !== id && norm(w.word) === norm(v.word))) throw new VocabularyError(VOCAB_MESSAGES.duplicate)
      Object.assign(words.find((w) => w.id === id)!, v)
    },
    async remove(id) {
      track('remove', [id])
      const w = words.find((x) => x.id === id)!
      if (w.review_count > 0) throw new VocabularyError(VOCAB_MESSAGES.history)
      words.splice(words.indexOf(w), 1)
    },
    async queue(limit = 20) {
      track('queue', [limit])
      const due = words.filter(isDue).sort((a, b) => a.next_review_at!.localeCompare(b.next_review_at!))
      const fresh = words.filter((w) => w.next_review_at === null).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      return [...due, ...fresh].slice(0, limit).map((w) => ({ ...w }) as unknown as QueueCard)
    },
    async review(vocabularyId, rating, requestId) {
      track('review', [vocabularyId, rating, requestId])
      const w = words.find((x) => x.id === vocabularyId)!
      const existing = reviews.find((r) => r.requestId === requestId)
      if (existing) return { next_review_at: w.next_review_at, interval_minutes: existing.minutes }
      const minutes = previewIntervalMinutes(w.review_streak, rating)
      reviews.push({ requestId, vocabularyId, rating, minutes })
      w.review_streak = previewStreakAfter(w.review_streak, rating)
      w.review_count += 1
      w.next_review_at = new Date(now + minutes * 60_000).toISOString()
      return { next_review_at: w.next_review_at, interval_minutes: minutes }
    },
  }

  return {
    service,
    words,
    reviews,
    calls,
    failOn: (n: keyof VocabularyService) => failures.add(n),
    recover: (n: keyof VocabularyService) => failures.delete(n),
    advance: (minutes: number) => {
      now += minutes * 60_000
    },
  }
}
