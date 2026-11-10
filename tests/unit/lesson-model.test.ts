import { describe, expect, it } from 'vitest'
import {
  formatScore,
  overallScore,
  parseScore,
  parseTopics,
  sortBlocks,
  validateExercise,
  validateLesson,
  type LessonInput,
} from '../../src/features/lessons/lesson-model'

const lesson: LessonInput = { lessonNumber: '4', title: 'Past simple', studiedOn: '2026-11-10', level: 'A2', topics: '', report: '' }

describe('Nota geral da aula (regra documentada)', () => {
  it('média simples das notas dos blocos avaliados, 1 casa decimal', () => {
    expect(overallScore([{ score: 8 }, { score: 9 }, { score: 7 }])).toBe(8)
    expect(overallScore([{ score: 7.5 }, { score: 8 }])).toBe(7.8) // 7,75 → 7,8
    expect(overallScore([{ score: 10 }, { score: 9.5 }, { score: 9.5 }])).toBe(9.7) // 9,666… → 9,7
  })
  it('blocos sem nota não entram; nenhum avaliado = sem nota', () => {
    expect(overallScore([{ score: 6 }, { score: null }])).toBe(6)
    expect(overallScore([{ score: null }])).toBeNull()
    expect(overallScore([])).toBeNull()
    expect(formatScore(null)).toBe('—')
    expect(formatScore(7.8)).toBe('7,8')
  })
})

describe('Entradas', () => {
  it('nota do bloco: 0–10, vírgula ou ponto, 1 casa; vazio = sem nota', () => {
    expect(parseScore('8,5')).toBe(8.5)
    expect(parseScore('10')).toBe(10)
    expect(parseScore('0')).toBe(0)
    expect(parseScore('  ')).toBeNull()
    for (const bad of ['10.5', '11', '-1', '8,55', 'abc']) expect(parseScore(bad)).toBeUndefined()
  })
  it('assuntos: por linha ou vírgula, sem vazios nem repetidos', () => {
    expect(parseTopics('Past simple, verbs\n\n past SIMPLE ,  irregular verbs')).toEqual(['Past simple', 'verbs', 'irregular verbs'])
  })
  it('blocos em ordem canônica', () => {
    expect(sortBlocks([{ block_type: 'review' }, { block_type: 'grammar' }, { block_type: 'reading' }]).map((b) => b.block_type)).toEqual(['grammar', 'reading', 'review'])
  })
})

describe('Validação', () => {
  it('aula válida normaliza título, assuntos e observações', () => {
    const { values, errors } = validateLesson({ ...lesson, title: '  Past simple ', topics: 'a, b', report: '  ' })
    expect(errors).toEqual({})
    expect(values).toEqual({ lesson_number: 4, title: 'Past simple', studied_on: '2026-11-10', level: 'A2', topics: ['a', 'b'], report: null })
  })
  it('número, título, data e nível são obrigatórios', () => {
    const { errors } = validateLesson({ lessonNumber: '0', title: ' ', studiedOn: '', level: 'Z9', topics: '', report: '' })
    expect(Object.keys(errors).sort()).toEqual(['lessonNumber', 'level', 'studiedOn', 'title'])
  })
  it('exercício exige enunciado; demais campos opcionais viram null', () => {
    expect(validateExercise({ prompt: ' ', myAnswer: '', correctedAnswer: '', explanation: '' }).errors.prompt).toBeTruthy()
    expect(validateExercise({ prompt: 'Complete: She ___ (go)', myAnswer: 'go', correctedAnswer: ' went ', explanation: '' }).values).toEqual({
      prompt: 'Complete: She ___ (go)',
      my_answer: 'go',
      corrected_answer: 'went',
      explanation: null,
    })
  })
})
