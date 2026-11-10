import { describe, expect, it } from 'vitest'
import { EMPTY_INPUT, reviewStatus, validateVocabulary, type VocabularyInput } from '../../src/features/vocabulary/vocabulary-model'
import { formatInterval, previewIntervalMinutes, previewStreakAfter } from '../../src/features/reviews/review-schedule'

const valid: VocabularyInput = { ...EMPTY_INPUT, word: 'tired', translation: 'cansado', example1: 'I am tired.', example2: 'She looks tired.' }

describe('1. Validação do vocabulário', () => {
  it('aceita registro válido, faz trim e usa origem manual por padrão', () => {
    const { values, errors } = validateVocabulary({ ...valid, word: '  tired ', notes: '   ' })
    expect(errors).toEqual({})
    expect(values).toMatchObject({ word: 'tired', notes: null, part_of_speech: null, source_type: 'manual', source_ref: null })
  })

  it('termo, tradução e os dois exemplos são obrigatórios (espaços não contam)', () => {
    const { errors } = validateVocabulary({ ...EMPTY_INPUT, word: '   ', translation: ' ', example1: '', example2: '  ' })
    expect(Object.keys(errors).sort()).toEqual(['example1', 'example2', 'translation', 'word'])
  })

  it('limites: termo 120, tradução 240, exemplos 500, notas 1000', () => {
    expect(validateVocabulary({ ...valid, word: 'x'.repeat(120) }).errors.word).toBeUndefined()
    expect(validateVocabulary({ ...valid, word: 'x'.repeat(121) }).errors.word).toBeTruthy()
    expect(validateVocabulary({ ...valid, translation: 'x'.repeat(241) }).errors.translation).toBeTruthy()
    expect(validateVocabulary({ ...valid, example1: 'x'.repeat(501) }).errors.example1).toBeTruthy()
    expect(validateVocabulary({ ...valid, example2: 'x'.repeat(500) }).errors.example2).toBeUndefined()
    expect(validateVocabulary({ ...valid, notes: 'x'.repeat(1001) }).errors.notes).toBeTruthy()
  })

  it('origem referenciada vira source_type/source_ref', () => {
    const id = '11111111-2222-4333-8444-555555555555'
    expect(validateVocabulary({ ...valid, source: `lesson:${id}` }).values).toMatchObject({ source_type: 'lesson', source_ref: id })
    expect(validateVocabulary({ ...valid, source: 'lesson:../x' }).errors.source).toBeTruthy()
  })

  it('status de revisão: nova, vencida ou agendada', () => {
    const now = new Date('2026-11-10T12:00:00Z')
    expect(reviewStatus(null, now).kind).toBe('new')
    expect(reviewStatus('2026-11-10T12:00:00Z', now).kind).toBe('due')
    expect(reviewStatus('2026-11-10T12:10:00Z', now).kind).toBe('scheduled')
  })
})

describe('7. Prévia dos intervalos (rótulos; o servidor é a fonte autoritativa)', () => {
  it('segue a tabela da ET-003 para cada nota e sequência', () => {
    const days = (s: number, r: 'again' | 'hard' | 'good' | 'easy') => previewIntervalMinutes(s, r) / 1440
    expect(previewIntervalMinutes(7, 'again')).toBe(10)
    expect([0, 1, 50].map((s) => days(s, 'hard'))).toEqual([1, 1, 1])
    expect([0, 1, 2, 3, 4, 5, 100].map((s) => days(s, 'good'))).toEqual([1, 3, 7, 14, 30, 30, 30])
    expect([0, 1, 2, 3, 4, 100].map((s) => days(s, 'easy'))).toEqual([3, 7, 14, 30, 30, 30])
  })

  it('sequência: again zera, hard mantém, good/easy +1 limitado a 100', () => {
    expect(previewStreakAfter(9, 'again')).toBe(0)
    expect(previewStreakAfter(9, 'hard')).toBe(9)
    expect(previewStreakAfter(9, 'good')).toBe(10)
    expect(previewStreakAfter(100, 'easy')).toBe(100)
  })

  it('formata minutos e dias', () => {
    expect(formatInterval(10)).toBe('10 min')
    expect(formatInterval(1440)).toBe('1 dia')
    expect(formatInterval(4320)).toBe('3 dias')
  })
})
