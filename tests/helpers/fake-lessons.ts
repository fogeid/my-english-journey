import type { BlockWithExercises, LessonDetail, LessonSummary } from '../../src/features/lessons/lesson-model'
import { LESSON_MESSAGES, LessonError, type LessonService } from '../../src/features/lessons/lesson-service'

/** LessonService em memória (testes de interface). Integridade real: tests/rls/lessons-rls.test.ts. */
export function createFakeLessonService() {
  let seq = 0
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
  const lessons: LessonDetail[] = []
  const calls: Record<string, unknown[][]> = {}
  const failures = new Set<keyof LessonService>()
  const track = (n: keyof LessonService, args: unknown[]) => {
    ;(calls[n] ??= []).push(args)
    if (failures.has(n)) throw new LessonError(n === 'list' ? LESSON_MESSAGES.load : n === 'get' ? LESSON_MESSAGES.loadOne : LESSON_MESSAGES.save)
  }
  const findBlock = (bid: string) => lessons.flatMap((l) => l.lesson_blocks).find((b) => b.id === bid)!
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

  const service: LessonService = {
    async list() {
      track('list', [])
      return lessons
        .map((l): LessonSummary => ({ ...clone(l), lesson_blocks: l.lesson_blocks.map((b) => ({ block_type: b.block_type, score: b.score })) }))
        .sort((a, b) => b.lesson_number - a.lesson_number)
    },
    async get(lessonId) {
      track('get', [lessonId])
      const l = lessons.find((x) => x.id === lessonId)
      return l ? clone(l) : null
    },
    async create(userId, v) {
      track('create', [v])
      if (lessons.some((l) => l.lesson_number === v.lesson_number)) throw new LessonError(LESSON_MESSAGES.duplicateNumber)
      const lessonId = id()
      lessons.push({
        id: lessonId,
        user_id: userId,
        source_key: null,
        created_at: new Date().toISOString(),
        status: 'in_progress',
        difficulties: null,
        recommendations: null,
        lesson_blocks: [],
        ...v,
      })
      return lessonId
    },
    async update(lessonId, v) {
      track('update', [lessonId, v])
      Object.assign(lessons.find((l) => l.id === lessonId)!, v)
    },
    async setStatus(lessonId, status) {
      track('setStatus', [lessonId, status])
      lessons.find((l) => l.id === lessonId)!.status = status
    },
    async remove(lessonId) {
      track('remove', [lessonId])
      lessons.splice(lessons.findIndex((l) => l.id === lessonId), 1)
    },
    async addBlock(userId, lessonId, type) {
      track('addBlock', [lessonId, type])
      const l = lessons.find((x) => x.id === lessonId)!
      if (l.lesson_blocks.some((b) => b.block_type === type)) throw new LessonError(LESSON_MESSAGES.duplicateBlock)
      const block: BlockWithExercises = { id: id(), user_id: userId, lesson_id: lessonId, block_type: type, score: null, notes: null, created_at: new Date().toISOString(), lesson_exercises: [] }
      l.lesson_blocks.push(block)
    },
    async updateBlock(blockId, v) {
      track('updateBlock', [blockId, v])
      Object.assign(findBlock(blockId), v)
    },
    async removeBlock(blockId) {
      track('removeBlock', [blockId])
      for (const l of lessons) l.lesson_blocks = l.lesson_blocks.filter((b) => b.id !== blockId)
    },
    async addExercise(userId, blockId, v) {
      track('addExercise', [blockId, v])
      findBlock(blockId).lesson_exercises.push({ id: id(), user_id: userId, block_id: blockId, created_at: new Date(Date.now() + seq).toISOString(), ...v })
    },
    async updateExercise(exerciseId, v) {
      track('updateExercise', [exerciseId, v])
      for (const l of lessons) for (const b of l.lesson_blocks) for (const x of b.lesson_exercises) if (x.id === exerciseId) Object.assign(x, v)
    },
    async removeExercise(exerciseId) {
      track('removeExercise', [exerciseId])
      for (const l of lessons) for (const b of l.lesson_blocks) b.lesson_exercises = b.lesson_exercises.filter((x) => x.id !== exerciseId)
    },
  }
  return { service, lessons, calls, failOn: (n: keyof LessonService) => failures.add(n), recover: (n: keyof LessonService) => failures.delete(n) }
}
