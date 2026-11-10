/**
 * ET-007 — modelo das etapas e gerador semanal (funções puras).
 */
import { describe, expect, it } from 'vitest'
import { LESSON_BLOCKS, LESSON_THEMES, MUSIC_BLOCKS, MUSIC_THEMES } from '../../src/features/schedule/generator-content'
import { buildPreview, scaleDurations, toPayload, validateConfig, type GeneratorConfig } from '../../src/features/schedule/schedule-generator'
import { sortSteps, stepsProgress, validateActivity, validateSteps, type Step } from '../../src/features/schedule/schedule-model'
import type { GeneratorContext } from '../../src/features/schedule/schedule-service'

const EMPTY: GeneratorContext = { activities: [], generatedKeys: [] }
const CONFIG: GeneratorConfig = {
  startDate: '2026-11-09', // segunda-feira
  days: 7,
  nextLesson: 4,
  nextMusic: 2,
  lessonMinutes: 60,
  musicMinutes: 60,
  includeComplementary: true,
}

const step = (key: string, title: string, plannedMinutes: string, description = '') => ({ key, title, description, plannedMinutes })

describe('Etapas — validação, ordem e progresso', () => {
  it('soma das etapas é o tempo previsto; descrição vazia vira null; id preservado', () => {
    const r = validateSteps([step('a', ' Revisão ', '10', ''), { ...step('b', 'Gramática', '15', 'exercícios'), id: 'st-1' }])
    expect(r.formError).toBeNull()
    expect(r.total).toBe(25)
    expect(r.values).toEqual([
      { title: 'Revisão', description: null, planned_minutes: 10 },
      { id: 'st-1', title: 'Gramática', description: 'exercícios', planned_minutes: 15 },
    ])
  })

  it('erros por etapa: título vazio, minutos fora de 1–240, descrição longa', () => {
    const r = validateSteps([step('a', '', '10'), step('b', 'ok', '0'), step('c', 'ok', '5', 'x'.repeat(1001))])
    expect(r.values).toBeNull()
    expect(r.errors.a.title).toMatch(/Informe/)
    expect(r.errors.b.plannedMinutes).toMatch(/De 1 a 240/)
    expect(r.errors.c.description).toMatch(/1000/)
  })

  it('soma acima de 240 min e mais de 20 etapas são rejeitadas', () => {
    expect(validateSteps([step('a', 'x', '200'), step('b', 'y', '41')]).formError).toMatch(/241 min/)
    const many = Array.from({ length: 21 }, (_, i) => step(String(i), `e${i}`, '1'))
    expect(validateSteps(many).formError).toMatch(/20 etapas/)
  })

  it('com etapas, os minutos digitados da atividade não são validados (são a soma)', () => {
    const input = { title: 'Aula', description: '', skill: 'lesson', plannedMinutes: '', studyDay: '2026-11-10' }
    const ctx = { weekStart: '2026-11-09', countOnTargetDay: 0 }
    expect(validateActivity(input, ctx).errors.plannedMinutes).toBeDefined()
    const r = validateActivity(input, { ...ctx, stepsTotal: 60 })
    expect(r.errors.plannedMinutes).toBeUndefined()
    expect(r.values?.plannedMinutes).toBe(60)
  })

  it('ordenação por posição e progresso em %', () => {
    const mk = (id: string, position: number, is_completed: boolean): Step => ({
      id, activity_id: 'a', position, title: id, description: null, planned_minutes: 5, is_completed, completed_at: is_completed ? 'x' : null,
    })
    const sorted = sortSteps([mk('c', 3, false), mk('a', 1, true), mk('b', 2, true)])
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(stepsProgress(sorted)).toEqual({ done: 2, total: 3, percent: 67 })
    expect(stepsProgress([])).toEqual({ done: 0, total: 0, percent: 0 })
  })
})

describe('Gerador — durações e configuração', () => {
  it('com 60 min, as etapas seguem exatamente a tabela (aula 10/15/10/10/10/5; música 10/15/15/10/10)', () => {
    expect(scaleDurations(LESSON_BLOCKS, 60)).toEqual([10, 15, 10, 10, 10, 5])
    expect(scaleDurations(MUSIC_BLOCKS, 60)).toEqual([10, 15, 15, 10, 10])
  })

  it.each([6, 7, 45, 90, 121, 240])('reescala para %i min com soma exata e etapas >= 1', (total) => {
    const d = scaleDurations(LESSON_BLOCKS, total)
    expect(d.reduce((a, b) => a + b, 0)).toBe(total)
    expect(d.every((m) => m >= 1)).toBe(true)
  })

  it('valida dias, números e durações', () => {
    expect(validateConfig(CONFIG)).toEqual([])
    const errs = validateConfig({ ...CONFIG, startDate: '', days: 15, nextLesson: 0, musicMinutes: 241 })
    expect(errs).toHaveLength(4)
    expect(validateConfig({ ...CONFIG, lessonMinutes: 5 })[0]).toMatch(/aula: de 6/)
  })
})

describe('Gerador — prévia', () => {
  it('7 dias: aula + música por dia com numeração sequencial e complementares por dia da semana', () => {
    const items = buildPreview(CONFIG, EMPTY)
    const lessons = items.filter((i) => i.kind === 'lesson')
    const music = items.filter((i) => i.kind === 'music')
    expect(lessons.map((i) => i.title.slice(0, 7))).toEqual(['Aula 04', 'Aula 05', 'Aula 06', 'Aula 07', 'Aula 08', 'Aula 09', 'Aula 10'])
    expect(music.map((i) => i.generator_key)).toEqual(['music:2', 'music:3', 'music:4', 'music:5', 'music:6', 'music:7', 'music:8'])
    expect(lessons.map((i) => i.study_day)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])

    // aulas 04–10 e músicas 02–08 estão planejadas, com descrições específicas por etapa
    expect(items.some((i) => i.unplanned)).toBe(false)
    expect(lessons[0].title).toBe(`Aula 04 — ${LESSON_THEMES.find((t) => t.number === 4)!.title}`)
    expect(lessons[0].steps).toHaveLength(6)
    expect(lessons[0].steps.every((s) => s.description)).toBe(true)
    const m2 = MUSIC_THEMES.find((t) => t.number === 2)!
    expect(music[0].title).toBe(`Estudo Musical 02 — ${m2.song} (${m2.artist})`)
    expect(music[0].steps.map((s) => s.planned_minutes)).toEqual([10, 15, 15, 10, 10])

    const comp = (day: string) => items.filter((i) => i.kind === 'complementary' && i.study_day === day).map((i) => i.title)
    expect(comp('2026-11-09')).toEqual(['Duolingo — 20 min'])
    expect(comp('2026-11-10')).toEqual(['Podcast A1 — 30 min'])
    expect(comp('2026-11-11')).toEqual(['BBC Learning English — 25 min'])
    expect(comp('2026-11-12')).toEqual(['Duolingo — 20 min', 'Flashcards no My English Journey — 10 min'])
    expect(comp('2026-11-13')).toEqual(['Série em inglês — 30 min'])
    expect(comp('2026-11-14')).toEqual(['Leitura A1 — 30 min'])
    expect(comp('2026-11-15')).toEqual(['Revisão e conversação — 30 min'])
    expect(items).toHaveLength(22)
    expect(items.every((i) => i.status === 'new')).toBe(true)
    // complementares não têm etapas; nada vem concluído
    expect(items.filter((i) => i.kind === 'complementary').every((i) => i.steps.length === 0)).toBe(true)
  })

  it('sem complementares: só aula e música', () => {
    const items = buildPreview({ ...CONFIG, includeComplementary: false }, EMPTY)
    expect(items).toHaveLength(14)
  })

  it('reexecução: itens já gerados aparecem como "exists" e não entram no payload', () => {
    const first = buildPreview(CONFIG, EMPTY)
    const ctx: GeneratorContext = { activities: [], generatedKeys: first.map((i) => i.generator_key) }
    const again = buildPreview(CONFIG, ctx)
    expect(again.every((i) => i.status === 'exists')).toBe(true)
  })

  it('período parcialmente preenchido: só os ausentes ficam como novos', () => {
    const first = buildPreview({ ...CONFIG, days: 3 }, EMPTY)
    const ctx: GeneratorContext = {
      activities: first.map((i) => ({ study_day: i.study_day, skill: i.skill, title: i.title, generator_key: i.generator_key })),
      generatedKeys: first.map((i) => i.generator_key),
    }
    const items = buildPreview(CONFIG, ctx)
    expect(items.filter((i) => i.status === 'exists')).toHaveLength(first.length)
    expect(items.filter((i) => i.status === 'new').every((i) => i.study_day >= '2026-11-12')).toBe(true)
  })

  it('conflitos com atividades manuais: mesmo número, mesmo dia/categoria, mesmo complementar', () => {
    const ctx: GeneratorContext = {
      generatedKeys: [],
      activities: [
        { study_day: '2026-10-20', skill: 'other', title: 'Aula 05 — feita à mão', generator_key: null },
        { study_day: '2026-11-11', skill: 'music', title: 'Minha música', generator_key: null },
        { study_day: '2026-11-13', skill: 'listening', title: 'Série em inglês (Friends)', generator_key: null },
      ],
    }
    const items = buildPreview(CONFIG, ctx)
    const byKey = Object.fromEntries(items.map((i) => [i.generator_key, i]))
    expect(byKey['lesson:5'].status).toBe('conflict')
    expect(byKey['lesson:5'].reason).toMatch(/Aula 05 — feita à mão/)
    expect(byKey['music:4'].status).toBe('conflict') // quarta 11/11, mesma categoria
    expect(byKey['comp:2026-11-13:serie'].status).toBe('conflict')
    expect(items.filter((i) => i.status === 'conflict')).toHaveLength(3)
  })

  it('números sem tema planejado são marcados como "unplanned" (tema a definir)', () => {
    const items = buildPreview({ ...CONFIG, nextLesson: 9, nextMusic: 8, days: 3, includeComplementary: false }, EMPTY)
    const flags = items.map((i) => `${i.generator_key}:${i.unplanned}`)
    expect(flags).toEqual(['lesson:9:false', 'music:8:false', 'lesson:10:false', 'music:9:true', 'lesson:11:true', 'music:10:true'])
    expect(items.find((i) => i.generator_key === 'lesson:11')!.title).toBe('Aula 11 — tema a definir')
  })

  it('payload: só campos da RPC, soma das etapas = minutos da atividade', () => {
    const [p] = toPayload(buildPreview({ ...CONFIG, days: 1, lessonMinutes: 45 }, EMPTY))
    expect(Object.keys(p).sort()).toEqual(['description', 'generator_key', 'planned_minutes', 'skill', 'steps', 'study_day', 'title'])
    expect(p.steps.reduce((n, s) => n + s.planned_minutes, 0)).toBe(45)
    expect(p.planned_minutes).toBe(45)
  })
})
