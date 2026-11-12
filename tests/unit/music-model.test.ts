import { describe, expect, it } from 'vitest'
import {
  comprehensionDelta,
  formatDelta,
  validateActivity,
  validateComprehension,
  validateStudy,
  validateWord,
} from '../../src/features/music/music-model'

describe('Compreensão inicial × final', () => {
  it('diferença = final − inicial, 1 casa; só quando as duas existem', () => {
    expect(comprehensionDelta(4, 7.5)).toBe(3.5)
    expect(comprehensionDelta(8, 6.5)).toBe(-1.5)
    expect(comprehensionDelta(5, 5)).toBe(0)
    expect(comprehensionDelta(0.1, 0.3)).toBe(0.2) // sem erro de ponto flutuante
    expect(comprehensionDelta(null, 7)).toBeNull()
    expect(comprehensionDelta(6, null)).toBeNull()
    expect([formatDelta(3.5), formatDelta(-1.5), formatDelta(0), formatDelta(null)]).toEqual(['+3,5', '−1,5', '0,0', '—'])
  })
  it('nota 0–10 com vírgula; vazio = sem avaliação; comentário limitado', () => {
    expect(validateComprehension({ score: '6,5', comment: ' bom ' }).value).toEqual({ score: 6.5, comment: 'bom' })
    expect(validateComprehension({ score: '', comment: '' }).value).toEqual({ score: null, comment: null })
    expect(validateComprehension({ score: '11', comment: '' }).error).toBeTruthy()
    expect(validateComprehension({ score: '5', comment: 'x'.repeat(2001) }).error).toBeTruthy()
  })
})

describe('Validações', () => {
  const base = { studyNumber: '1', song: 'Song', artist: 'Artist', studiedOn: '2026-11-10', level: 'A2', report: '' }
  it('estudo: número, música, artista, data e nível obrigatórios', () => {
    expect(validateStudy(base).values).toEqual({ study_number: 1, song: 'Song', artist: 'Artist', studied_on: '2026-11-10', level: 'A2', report: null })
    const { errors } = validateStudy({ studyNumber: '0', song: ' ', artist: '', studiedOn: '', level: '', report: '' })
    expect(Object.keys(errors).sort()).toEqual(['artist', 'level', 'song', 'studiedOn', 'studyNumber'])
  })
  it('atividade: ao menos um campo, cada um até 2000 caracteres (trechos curtos)', () => {
    const empty = { my_answers: '', difficulties: '', corrections: '', explanations: '', notes: '' }
    expect(validateActivity(empty).error).toBe('Preencha ao menos um campo.')
    expect(validateActivity({ ...empty, difficulties: ' ritmo rápido ' }).values).toEqual({ ...Object.fromEntries(Object.keys(empty).map((k) => [k, null])), difficulties: 'ritmo rápido' })
    expect(validateActivity({ ...empty, notes: 'x'.repeat(2001) }).error).toMatch(/2000/)
  })
  it('palavra do estudo: termo e significado obrigatórios; trecho curto até 300', () => {
    expect(validateWord({ term: ' count on ', meaning: 'contar com', excerpt: '' }).values).toEqual({ term: 'count on', meaning: 'contar com', excerpt: null })
    expect(validateWord({ term: '', meaning: '', excerpt: '' }).errors.term).toBeTruthy()
    expect(validateWord({ term: 'x', meaning: '', excerpt: 'x'.repeat(301) }).errors.excerpt).toMatch(/300/)
    expect(validateWord({ term: 'x', meaning: '   ', excerpt: '' }).errors.meaning).toBe('Informe o significado.')
    expect(validateWord({ term: 'x', meaning: 'x'.repeat(241), excerpt: '' }).errors.meaning).toMatch(/240/)
  })
})
