import { describe, expect, it } from 'vitest'
import {
  addDays,
  civilDateInZone,
  currentWeekStart,
  formatDayLabel,
  formatWeekRange,
  isDateInWeek,
  isoWeekday,
  weekDays,
  weekStartOf,
} from '../../src/features/schedule/week'
import {
  validateActivity,
  validateActualMinutes,
  weekProgressPercent,
  type ActivityInput,
} from '../../src/features/schedule/schedule-model'

describe('1. Semana ISO e fuso America/Cuiaba', () => {
  it('a semana começa na segunda-feira', () => {
    expect(isoWeekday('2026-11-09')).toBe(1) // segunda
    expect(isoWeekday('2026-11-15')).toBe(7) // domingo
    expect(weekStartOf('2026-11-09')).toBe('2026-11-09')
    expect(weekStartOf('2026-11-12')).toBe('2026-11-09')
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09') // domingo pertence à semana anterior
    expect(weekStartOf('2026-11-16')).toBe('2026-11-16')
  })

  it('mudança de mês e de ano sem deslocamento', () => {
    expect(weekStartOf('2026-12-01')).toBe('2026-11-30')
    expect(weekStartOf('2027-01-03')).toBe('2026-12-28') // domingo de ano novo
    expect(weekStartOf('2027-01-04')).toBe('2027-01-04')
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04')
    expect(addDays('2027-01-04', -7)).toBe('2026-12-28')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29') // ano bissexto
    expect(weekDays('2026-12-28')).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ])
  })

  it('usa o dia civil de Cuiabá (UTC−4), não o dia UTC', () => {
    // 03:30 UTC de segunda = 23:30 de domingo em Cuiabá → semana anterior.
    expect(civilDateInZone(new Date('2026-11-09T03:30:00Z'))).toBe('2026-11-08')
    expect(currentWeekStart(new Date('2026-11-09T03:30:00Z'))).toBe('2026-11-02')
    // 04:00 UTC = 00:00 de segunda em Cuiabá → nova semana.
    expect(civilDateInZone(new Date('2026-11-09T04:00:00Z'))).toBe('2026-11-09')
    expect(currentWeekStart(new Date('2026-11-09T04:00:00Z'))).toBe('2026-11-09')
    // Virada de ano: 03:59 UTC de 1/1 ainda é 31/12 em Cuiabá.
    expect(civilDateInZone(new Date('2027-01-01T03:59:00Z'))).toBe('2026-12-31')
    expect(currentWeekStart(new Date('2027-01-01T03:59:00Z'))).toBe('2026-12-28')
  })

  it('rótulos de dia e intervalo não deslocam a data', () => {
    expect(formatDayLabel('2026-11-09')).toMatch(/segunda-feira.*09\/11/)
    expect(formatDayLabel('2026-11-15')).toMatch(/domingo.*15\/11/)
    expect(formatWeekRange('2026-12-28')).toBe('28/12/2026 – 03/01/2027')
  })

  it('isDateInWeek respeita segunda a domingo', () => {
    expect(isDateInWeek('2026-11-09', '2026-11-09')).toBe(true)
    expect(isDateInWeek('2026-11-15', '2026-11-09')).toBe(true)
    expect(isDateInWeek('2026-11-16', '2026-11-09')).toBe(false)
    expect(isDateInWeek('2026-11-08', '2026-11-09')).toBe(false)
  })
})

describe('5/6. Regras de validação', () => {
  const base: ActivityInput = { title: 'Leitura', description: '', skill: 'grammar', plannedMinutes: '20', studyDay: '2026-11-10' }
  const ctx = { weekStart: '2026-11-09', countOnTargetDay: 0 }

  it('aceita uma atividade válida e normaliza título/descrição', () => {
    const { values, errors } = validateActivity({ ...base, title: '  Leitura  ', description: '  ' }, ctx)
    expect(errors).toEqual({})
    expect(values).toEqual({ title: 'Leitura', description: null, skill: 'grammar', plannedMinutes: 20, studyDay: '2026-11-10' })
  })

  it('título obrigatório e até 120 caracteres; descrição até 2000', () => {
    expect(validateActivity({ ...base, title: '   ' }, ctx).errors.title).toBeTruthy()
    expect(validateActivity({ ...base, title: 'x'.repeat(121) }, ctx).errors.title).toBeTruthy()
    expect(validateActivity({ ...base, title: 'x'.repeat(120) }, ctx).errors.title).toBeUndefined()
    expect(validateActivity({ ...base, description: 'x'.repeat(2001) }, ctx).errors.description).toBeTruthy()
  })

  it('categorias do MVP; writing só quando permitido explicitamente', () => {
    for (const s of ['grammar', 'vocabulary', 'listening', 'speaking', 'review', 'other']) {
      expect(validateActivity({ ...base, skill: s }, ctx).errors.skill).toBeUndefined()
    }
    expect(validateActivity({ ...base, skill: 'writing' }, ctx).errors.skill).toBeTruthy()
    expect(validateActivity({ ...base, skill: '' }, ctx).errors.skill).toBeTruthy()
    expect(validateActivity({ ...base, skill: 'writing' }, { ...ctx, allowedSkills: ['writing'] }).errors.skill).toBeUndefined()
  })

  it('minutos previstos: inteiro de 1 a 240', () => {
    for (const bad of ['0', '241', '1.5', '-3', '', 'abc']) {
      expect(validateActivity({ ...base, plannedMinutes: bad }, ctx).errors.plannedMinutes).toBeTruthy()
    }
    expect(validateActivity({ ...base, plannedMinutes: '1' }, ctx).errors.plannedMinutes).toBeUndefined()
    expect(validateActivity({ ...base, plannedMinutes: '240' }, ctx).errors.plannedMinutes).toBeUndefined()
  })

  it('dia dentro da semana e limite de 30 atividades por dia', () => {
    expect(validateActivity({ ...base, studyDay: '2026-11-16' }, ctx).errors.studyDay).toBeTruthy()
    expect(validateActivity(base, { ...ctx, countOnTargetDay: 30 }).errors.studyDay).toBeTruthy()
    expect(validateActivity(base, { ...ctx, countOnTargetDay: 29 }).errors.studyDay).toBeUndefined()
  })

  it('minutos reais: inteiro de 0 a 480 (0 permitido)', () => {
    expect(validateActualMinutes('0')).toEqual({ value: 0, error: null })
    expect(validateActualMinutes('480')).toEqual({ value: 480, error: null })
    for (const bad of ['481', '-1', '2.5', '', 'x']) expect(validateActualMinutes(bad).value).toBeNull()
  })

  it('progresso semanal: 0% sem atividades; concluídas / planejadas', () => {
    const z = { has_plan: false, planned_count: 0, planned_minutes: 0, completed_count: 0, completed_minutes: 0 }
    expect(weekProgressPercent(z)).toBe(0)
    expect(weekProgressPercent({ ...z, has_plan: true, planned_count: 5, completed_count: 2 })).toBe(40)
  })
})
