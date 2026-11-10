import { describe, expect, it } from 'vitest'
import {
  computeProgress,
  formatMinutes,
  periodRange,
  startOfCivilDayUtc,
  type RawLesson,
  type RawProgressData,
} from '../../src/features/progress/progress-model'

const TODAY = '2026-11-10' // terça

const lesson = (p: Partial<RawLesson>): RawLesson => ({
  id: `l${p.lesson_number}`,
  lesson_number: 1,
  title: null,
  studied_on: null,
  status: 'completed',
  difficulties: null,
  recommendations: null,
  lesson_blocks: [],
  ...p,
})
const empty: RawProgressData = { sessions: [], activities: [], lessons: [], vocabularyCreatedAt: [], reviewedAt: [] }

describe('Períodos (America/Cuiaba)', () => {
  it('últimos N dias incluem hoje', () => {
    expect(periodRange('7d', TODAY)).toEqual({ from: '2026-11-04', to: TODAY })
    expect(periodRange('30d', TODAY)).toEqual({ from: '2026-10-12', to: TODAY })
    expect(periodRange('90d', TODAY)).toEqual({ from: '2026-08-13', to: TODAY })
    expect(periodRange('all', TODAY)).toEqual({ from: null, to: TODAY })
  })
  it('início do dia civil em Cuiabá = 04:00 UTC', () => {
    expect(startOfCivilDayUtc('2026-11-10').toISOString()).toBe('2026-11-10T04:00:00.000Z')
  })
  it('instante é atribuído ao dia civil de Cuiabá, não ao dia UTC', () => {
    const raw: RawProgressData = {
      ...empty,
      sessions: [
        { actual_minutes: 30, is_completed: true, completed_at: '2026-11-04T03:30:00Z', activity_id: null }, // 03/11 23:30 em Cuiabá → fora
        { actual_minutes: 20, is_completed: true, completed_at: '2026-11-04T04:10:00Z', activity_id: null }, // 04/11 00:10 → dentro
      ],
    }
    const p = computeProgress(raw, '7d', TODAY)
    expect(p.minutesStudied).toBe(20)
    expect(p.studyDays).toBe(1)
  })
})

describe('Resumo', () => {
  it('estado vazio: zeros reais, frequência 0 no período e nenhuma série', () => {
    const p = computeProgress(empty, '30d', TODAY)
    expect(p).toMatchObject({ completedLessons: 0, minutesStudied: 0, wordsTotal: 0, reviewsDone: 0, studyDays: 0, periodDays: 30, avgDaysPerWeek: 0 })
    expect(p.scoreSeries).toEqual([])
    expect(p.skills.every((s) => s.average === null)).toBe(true)
    expect(computeProgress(empty, 'all', TODAY)).toMatchObject({ firstDay: null, periodDays: 0, avgDaysPerWeek: null, weeks: [] })
  })

  it('horas: só execuções concluídas (reabertas não contam), pela data real de conclusão', () => {
    const raw: RawProgressData = {
      ...empty,
      sessions: [
        { actual_minutes: 45, is_completed: true, completed_at: '2026-11-09T15:00:00Z', activity_id: 'a1' },
        { actual_minutes: 30, is_completed: false, completed_at: '2026-11-09T16:00:00Z', activity_id: 'a2' }, // reaberta
        { actual_minutes: 25, is_completed: true, completed_at: '2026-11-10T12:00:00Z', activity_id: null },
      ],
    }
    const p = computeProgress(raw, '7d', TODAY)
    expect(p.minutesStudied).toBe(70)
    expect(p.completedSessions).toBe(2)
    expect(formatMinutes(p.minutesStudied)).toBe('1 h 10 min')
  })

  it('planejado × realizado: pelo dia planejado; realizado = execução concluída', () => {
    const raw: RawProgressData = {
      ...empty,
      activities: [
        { id: 'a1', study_day: '2026-11-09', planned_minutes: 30 },
        { id: 'a2', study_day: '2026-11-09', planned_minutes: 20 },
        { id: 'a3', study_day: '2026-11-10', planned_minutes: 10 },
        { id: 'old', study_day: '2026-10-01', planned_minutes: 99 }, // fora do período
      ],
      sessions: [
        { actual_minutes: 35, is_completed: true, completed_at: '2026-11-11T01:00:00Z', activity_id: 'a1' }, // concluída depois, conta pela atividade
        { actual_minutes: 15, is_completed: false, completed_at: '2026-11-09T20:00:00Z', activity_id: 'a2' }, // reaberta → não realizada
      ],
    }
    const p = computeProgress(raw, '7d', TODAY)
    expect(p.planned).toEqual({ activities: 3, minutes: 60 })
    expect(p.realized).toEqual({ activities: 1, minutes: 35 })
  })

  it('aulas concluídas, palavras e revisões no período; nível não é inferido', () => {
    const raw: RawProgressData = {
      ...empty,
      lessons: [
        lesson({ lesson_number: 1, studied_on: '2026-11-05', status: 'completed' }),
        lesson({ lesson_number: 2, studied_on: '2026-11-09', status: 'in_progress' }),
        lesson({ lesson_number: 3, studied_on: '2026-10-01', status: 'completed' }),
        lesson({ lesson_number: 4, studied_on: null, status: 'completed' }),
      ],
      vocabularyCreatedAt: ['2026-10-01T12:00:00Z', '2026-11-08T12:00:00Z'],
      reviewedAt: ['2026-11-08T12:00:00Z', '2026-11-08T13:00:00Z', '2026-11-10T12:00:00Z'],
    }
    const week = computeProgress(raw, '7d', TODAY)
    expect(week).toMatchObject({ completedLessons: 1, wordsTotal: 2, wordsAdded: 1, reviewsDone: 3 })
    // "todo o período" inclui a aula concluída sem data nos totais
    expect(computeProgress(raw, 'all', TODAY).completedLessons).toBe(3)
    expect(week).not.toHaveProperty('level')
  })

  it('frequência: dias distintos com sessão concluída, aula registrada ou revisão; média por semana', () => {
    const raw: RawProgressData = {
      ...empty,
      sessions: [
        { actual_minutes: 10, is_completed: true, completed_at: '2026-11-04T15:00:00Z', activity_id: null },
        { actual_minutes: 10, is_completed: true, completed_at: '2026-11-04T18:00:00Z', activity_id: null }, // mesmo dia
      ],
      lessons: [lesson({ lesson_number: 1, studied_on: '2026-11-06', status: 'in_progress' })],
      reviewedAt: ['2026-11-10T12:00:00Z'],
    }
    const p = computeProgress(raw, '7d', TODAY)
    expect(p.studyDays).toBe(3)
    expect(p.avgDaysPerWeek).toBe(3)
    expect(p.weeks).toEqual([
      { weekStart: '2026-11-02', days: 2 },
      { weekStart: '2026-11-09', days: 1 },
    ])
    const all = computeProgress(raw, 'all', TODAY)
    expect(all.firstDay).toBe('2026-11-04')
    expect(all.periodDays).toBe(7)
  })
})

describe('Notas', () => {
  const raw: RawProgressData = {
    ...empty,
    lessons: [
      lesson({ lesson_number: 2, studied_on: '2026-11-08', lesson_blocks: [{ block_type: 'grammar', score: 9 }, { block_type: 'review', score: 5 }] }),
      lesson({ lesson_number: 1, studied_on: '2026-11-05', lesson_blocks: [{ block_type: 'grammar', score: 7 }, { block_type: 'listening', score: 8 }, { block_type: 'speaking', score: null }] }),
      lesson({ lesson_number: 3, studied_on: '2026-11-09', status: 'in_progress', lesson_blocks: [{ block_type: 'grammar', score: 2 }] }),
      lesson({ lesson_number: 4, studied_on: '2026-11-09', lesson_blocks: [{ block_type: 'reading', score: null }] }),
      lesson({ lesson_number: 5, studied_on: null, lesson_blocks: [{ block_type: 'writing', score: 6 }] }),
    ],
  }

  it('evolução: só aulas concluídas, com data e com nota; ordem por data; nota = regra da ET-004', () => {
    const p = computeProgress(raw, 'all', TODAY)
    expect(p.scoreSeries.map((s) => [s.lessonNumber, s.score])).toEqual([
      [1, 7.5],
      [2, 7], // (9 + 5) / 2 — o bloco de revisão entra na nota GERAL da aula (regra da ET-004)
    ])
    expect(p.completedWithoutScore).toBe(1) // aula 4
  })

  it('habilidades: blocos com nota de aulas concluídas; revisão e aulas em andamento ficam fora', () => {
    const p = computeProgress(raw, 'all', TODAY)
    const by = Object.fromEntries(p.skills.map((s) => [s.skill, [s.average, s.blocks]]))
    expect(by).toEqual({
      grammar: [8, 2], // 7 e 9 (o 2 da aula em andamento não entra)
      vocabulary: [null, 0],
      listening: [8, 1],
      speaking: [null, 0], // bloco sem nota
      reading: [null, 0],
      writing: [6, 1], // aula concluída sem data entra em "todo o período"
    })
    expect(p.skills.map((s) => s.skill)).not.toContain('review')
  })

  it('período filtra as aulas pela data', () => {
    const p = computeProgress(raw, '7d', TODAY) // 04/11 a 10/11
    expect(p.scoreSeries.map((s) => s.lessonNumber)).toEqual([1, 2])
    expect(p.skills.find((s) => s.skill === 'writing')!.average).toBeNull() // aula sem data fica fora
  })

  it('dificuldades e recomendações com referência à aula, mais recentes primeiro', () => {
    const p = computeProgress(
      {
        ...empty,
        lessons: [
          lesson({ lesson_number: 1, title: 'A', studied_on: '2026-11-05', difficulties: 'th' }),
          lesson({ lesson_number: 2, title: 'B', studied_on: '2026-11-08', recommendations: 'listening diário', status: 'in_progress' }),
          lesson({ lesson_number: 3, studied_on: '2026-11-09' }),
        ],
      },
      '7d',
      TODAY,
    )
    expect(p.notes.map((n) => [n.lessonNumber, n.title, n.difficulties, n.recommendations])).toEqual([
      [2, 'B', null, 'listening diário'],
      [1, 'A', 'th', null],
    ])
  })
})

describe('ET-007 — estudos musicais na frequência', () => {
  const base: RawProgressData = {
    ...empty,
    sessions: [{ actual_minutes: 30, is_completed: true, completed_at: '2026-11-09T15:00:00Z', activity_id: null }], // 09/11
    lessons: [lesson({ lesson_number: 1, studied_on: '2026-11-08', status: 'completed' })], // 08/11
    reviewedAt: ['2026-11-07T12:00:00Z'], // 07/11
  }

  it('estudo musical concluído conta como dia de estudo na data registrada', () => {
    const p = computeProgress({ ...base, musicStudies: [{ studied_on: '2026-11-05', status: 'completed' }] }, '7d', TODAY)
    expect(p.studyDays).toBe(4)
    expect(p.weeks.find((w) => w.weekStart === '2026-11-02')!.days).toBe(3) // 05, 07, 08
  })

  it('não conta duas vezes o mesmo dia (aula, revisão, sessão e música no mesmo dia)', () => {
    const sameDay: RawProgressData = {
      ...empty,
      sessions: [{ actual_minutes: 20, is_completed: true, completed_at: '2026-11-09T15:00:00Z', activity_id: null }],
      lessons: [lesson({ lesson_number: 1, studied_on: '2026-11-09' })],
      reviewedAt: ['2026-11-09T16:00:00Z'],
      musicStudies: [
        { studied_on: '2026-11-09', status: 'completed' },
        { studied_on: '2026-11-09', status: 'completed' },
      ],
    }
    expect(computeProgress(sameDay, '7d', TODAY).studyDays).toBe(1)
  })

  it('estudo em andamento, sem data ou fora do período não conta', () => {
    const p = computeProgress(
      {
        ...base,
        musicStudies: [
          { studied_on: '2026-11-06', status: 'in_progress' },
          { studied_on: null, status: 'completed' },
          { studied_on: '2026-10-01', status: 'completed' },
        ],
      },
      '7d',
      TODAY,
    )
    expect(p.studyDays).toBe(3) // só sessão, aula e revisão
  })

  it('não acrescenta duração às horas estudadas e preserva os demais cálculos', () => {
    const without = computeProgress(base, '7d', TODAY)
    const withMusic = computeProgress({ ...base, musicStudies: [{ studied_on: '2026-11-05', status: 'completed' }] }, '7d', TODAY)
    expect(withMusic.minutesStudied).toBe(without.minutesStudied)
    expect(withMusic.completedLessons).toBe(without.completedLessons)
    expect(withMusic.reviewsDone).toBe(without.reviewsDone)
    expect(withMusic.scoreSeries).toEqual(without.scoreSeries)
  })

  it('"todo o período" pode começar num estudo musical', () => {
    const p = computeProgress({ ...base, musicStudies: [{ studied_on: '2026-11-01', status: 'completed' }] }, 'all', TODAY)
    expect(p.firstDay).toBe('2026-11-01')
    expect(p.periodDays).toBe(10)
    expect(p.studyDays).toBe(4)
  })
})
