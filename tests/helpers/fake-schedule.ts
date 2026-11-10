import type { Activity, Plan, Session, Step, WeekSummary } from '../../src/features/schedule/schedule-model'
import { SCHEDULE_MESSAGES, ScheduleError, type ScheduleService } from '../../src/features/schedule/schedule-service'
import { currentWeekStart, isDateInWeek, weekStartOf } from '../../src/features/schedule/week'

/**
 * ScheduleService em memória para testes de interface.
 * Espelha os contratos do banco (validados de verdade em tests/rls/schedule-rls.test.ts):
 * um plano por semana, plano inicial idempotente, uma execução por atividade,
 * reabertura preservando minutos, exclusão bloqueada com histórico; ET-007: etapas (subatividades)
 * com a mesma regra de conclusão da RPC, gravação atômica e gerador idempotente por generator_key.
 * Permite injetar falhas para testar estados de erro.
 */
export function createFakeScheduleService() {
  const plans: Plan[] = []
  const activities: Activity[] = []
  const sessions: Session[] = []
  const steps: Step[] = []
  const generatorKeys = new Map<string, string>() // generator_key -> activity id
  let seq = 0
  const nextId = (p: string) => `${p}-${String(++seq).padStart(4, '0')}`
  const failures = new Set<keyof ScheduleService>()
  const calls: Record<string, unknown[][]> = {}

  const track = (name: keyof ScheduleService, args: unknown[]) => {
    ;(calls[name] ??= []).push(args)
    if (failures.has(name)) {
      throw new ScheduleError(
        name === 'loadWeek' ? SCHEDULE_MESSAGES.load : name === 'getWeekSummary' ? SCHEDULE_MESSAGES.summary : SCHEDULE_MESSAGES.save,
      )
    }
  }

  const summaryOf = (weekStart: string): WeekSummary => {
    const plan = plans.find((p) => p.week_start === weekStart)
    const acts = plan ? activities.filter((a) => a.plan_id === plan.id) : []
    const done = acts.map((a) => sessions.find((s) => s.activity_id === a.id)).filter((s) => s?.is_completed) as Session[]
    return {
      has_plan: !!plan,
      planned_count: acts.length,
      planned_minutes: acts.reduce((n, a) => n + a.planned_minutes, 0),
      completed_count: done.length,
      completed_minutes: done.reduce((n, s) => n + s.actual_minutes, 0),
    }
  }

  const nextPosition = (planId: string, day: string, exceptId?: string) =>
    Math.max(0, ...activities.filter((a) => a.plan_id === planId && a.study_day === day && a.id !== exceptId).map((a) => a.position)) + 1

  const service: ScheduleService = {
    async loadWeek(weekStart) {
      track('loadWeek', [weekStart])
      const plan = plans.find((p) => p.week_start === weekStart) ?? null
      const acts = plan ? activities.filter((a) => a.plan_id === plan.id).map((a) => ({ ...a })) : []
      const map: Record<string, Session> = {}
      for (const s of sessions) if (s.activity_id && acts.some((a) => a.id === s.activity_id)) map[s.activity_id] = { ...s }
      const stepMap: Record<string, Step[]> = {}
      for (const st of steps) if (acts.some((a) => a.id === st.activity_id)) (stepMap[st.activity_id] ??= []).push({ ...st })
      for (const k of Object.keys(stepMap)) stepMap[k].sort((a, b) => a.position - b.position)
      return { weekStart, plan: plan && { ...plan }, activities: acts, sessions: map, steps: stepMap, summary: summaryOf(weekStart) }
    },
    async getWeekSummary(weekStart) {
      track('getWeekSummary', [weekStart])
      return summaryOf(weekStart)
    },
    async createInitialPlan() {
      track('createInitialPlan', [])
      const week = currentWeekStart(new Date())
      if (plans.some((p) => p.week_start === week)) return
      const plan = { id: nextId('plan'), week_start: week, title: `Semana de ${week}` }
      plans.push(plan)
      const rows: [string, string, string, number][] = [
        ['grammar', 'Apresentando-se — Gramática', "I am / You are / He is / She is; contrações I'm, you're, he's.", 15],
        ['vocabulary', 'Apresentando-se — Vocabulário', 'name, age, city, country, job, student, happy, tired.', 10],
        ['listening', 'Apresentando-se — Listening', 'Ouça um diálogo de apresentação A1 do British Council.', 15],
        ['speaking', 'Apresentando-se — Speaking', 'Escreva 8 frases sobre você e leia cada uma em voz alta.', 10],
        ['review', 'Apresentando-se — Revisão', 'Revise o conteúdo, escreva 3 frases novas e confira os erros.', 10],
      ]
      rows.forEach(([skill, title, description, planned_minutes], i) =>
        activities.push({ id: nextId('act'), plan_id: plan.id, study_day: week, position: i + 1, skill, title, description, planned_minutes }),
      )
    },
    async createEmptyPlan(_userId, weekStart) {
      track('createEmptyPlan', [weekStart])
      if (!plans.some((p) => p.week_start === weekStart)) {
        plans.push({ id: nextId('plan'), week_start: weekStart, title: `Semana de ${weekStart}` })
      }
    },
    async createActivity(_userId, planId, v) {
      track('createActivity', [planId, v])
      const plan = plans.find((p) => p.id === planId)
      if (!plan || !isDateInWeek(v.studyDay, plan.week_start)) throw new ScheduleError(SCHEDULE_MESSAGES.invalid)
      activities.push({
        id: nextId('act'),
        plan_id: planId,
        study_day: v.studyDay,
        position: nextPosition(planId, v.studyDay),
        skill: v.skill,
        title: v.title,
        description: v.description,
        planned_minutes: v.plannedMinutes,
      })
    },
    async updateActivity(activityId, v) {
      track('updateActivity', [activityId, v])
      const a = activities.find((x) => x.id === activityId)
      if (!a) throw new ScheduleError(SCHEDULE_MESSAGES.save)
      const plan = plans.find((p) => p.id === a.plan_id)!
      if (!isDateInWeek(v.studyDay, plan.week_start)) throw new ScheduleError(SCHEDULE_MESSAGES.invalid)
      if (v.studyDay !== a.study_day) a.position = nextPosition(a.plan_id, v.studyDay, a.id)
      Object.assign(a, { study_day: v.studyDay, skill: v.skill, title: v.title, description: v.description, planned_minutes: v.plannedMinutes })
    },
    async deleteActivity(activityId) {
      track('deleteActivity', [activityId])
      if (sessions.some((s) => s.activity_id === activityId)) throw new ScheduleError(SCHEDULE_MESSAGES.history)
      const i = activities.findIndex((a) => a.id === activityId)
      if (i < 0) throw new ScheduleError(SCHEDULE_MESSAGES.save)
      activities.splice(i, 1)
      for (let k = steps.length - 1; k >= 0; k--) if (steps[k].activity_id === activityId) steps.splice(k, 1)
    },
    async completeActivity(activityId, actualMinutes) {
      track('completeActivity', [activityId, actualMinutes])
      if (!Number.isInteger(actualMinutes) || actualMinutes < 0 || actualMinutes > 480) throw new ScheduleError(SCHEDULE_MESSAGES.invalid)
      const now = new Date().toISOString()
      const existing = sessions.find((s) => s.activity_id === activityId)
      if (existing) Object.assign(existing, { is_completed: true, completed_at: now, actual_minutes: actualMinutes })
      else sessions.push({ id: nextId('ses'), activity_id: activityId, completed_at: now, actual_minutes: actualMinutes, is_completed: true, reopened_at: null })
      for (const st of steps) if (st.activity_id === activityId && !st.is_completed) Object.assign(st, { is_completed: true, completed_at: now })
    },
    async reopenActivity(activityId) {
      track('reopenActivity', [activityId])
      const s = sessions.find((x) => x.activity_id === activityId)
      if (!s) throw new ScheduleError(SCHEDULE_MESSAGES.save)
      if (s.is_completed) Object.assign(s, { is_completed: false, reopened_at: new Date().toISOString() })
      for (const st of steps) if (st.activity_id === activityId) Object.assign(st, { is_completed: false, completed_at: null })
    },
    async saveActivity({ activityId, planId, values: v, steps: list }) {
      track('saveActivity', [activityId, v, list])
      const total = list.reduce((n, st) => n + st.planned_minutes, 0)
      if (list.length > 0 && total > 240) throw new ScheduleError(SCHEDULE_MESSAGES.tooLong)
      if (list.some((st) => st.id && !steps.some((x) => x.id === st.id && x.activity_id === activityId))) throw new ScheduleError(SCHEDULE_MESSAGES.invalid)
      let id = activityId
      if (!id) {
        await service.createActivity('u', planId, { ...v, plannedMinutes: list.length ? total : v.plannedMinutes })
        id = activities[activities.length - 1].id
      } else {
        await service.updateActivity(id, { ...v, plannedMinutes: list.length ? total : v.plannedMinutes })
      }
      const keep = new Set<string>()
      list.forEach((st, i) => {
        const existing = st.id ? steps.find((x) => x.id === st.id) : undefined
        if (existing) {
          Object.assign(existing, { position: i + 1, title: st.title, description: st.description, planned_minutes: st.planned_minutes })
          keep.add(existing.id)
        } else {
          const nid = nextId('step')
          steps.push({ id: nid, activity_id: id!, position: i + 1, title: st.title, description: st.description, planned_minutes: st.planned_minutes, is_completed: false, completed_at: null })
          keep.add(nid)
        }
      })
      for (let k = steps.length - 1; k >= 0; k--) if (steps[k].activity_id === id && !keep.has(steps[k].id)) steps.splice(k, 1)
      const mine = steps.filter((x) => x.activity_id === id)
      const ses = sessions.find((x) => x.activity_id === id)
      if (mine.length && mine.some((x) => !x.is_completed) && ses?.is_completed) Object.assign(ses, { is_completed: false, reopened_at: new Date().toISOString() })
    },
    async setStepCompleted(stepId, completed, actualMinutes) {
      track('setStepCompleted', [stepId, completed, actualMinutes])
      const st = steps.find((x) => x.id === stepId)
      if (!st) throw new ScheduleError(SCHEDULE_MESSAGES.save)
      if (st.is_completed === completed) return
      const siblings = steps.filter((x) => x.activity_id === st.activity_id)
      const allDone = siblings.every((x) => x.is_completed || x.id === stepId)
      if (completed && allDone) {
        if (actualMinutes === undefined) throw new ScheduleError(SCHEDULE_MESSAGES.minutesRequired)
        await service.completeActivity(st.activity_id, actualMinutes)
        return
      }
      Object.assign(st, { is_completed: completed, completed_at: completed ? new Date().toISOString() : null })
      const ses = sessions.find((x) => x.activity_id === st.activity_id)
      if (!completed && ses?.is_completed) Object.assign(ses, { is_completed: false, reopened_at: new Date().toISOString() })
    },
    async generate(items) {
      track('generate', [items])
      let created = 0
      let skipped = 0
      // tudo ou nada, como a RPC: valida antes de gravar
      if (items.some((it) => !it.generator_key)) throw new ScheduleError(SCHEDULE_MESSAGES.generate)
      for (const it of items) {
        if (generatorKeys.has(it.generator_key)) {
          skipped++
          continue
        }
        const week = weekStartOf(it.study_day)
        if (!plans.some((p) => p.week_start === week)) plans.push({ id: nextId('plan'), week_start: week, title: `Semana de ${week}` })
        const plan = plans.find((p) => p.week_start === week)!
        await service.saveActivity({
          activityId: null,
          planId: plan.id,
          values: { title: it.title, description: it.description, skill: it.skill, plannedMinutes: it.planned_minutes, studyDay: it.study_day },
          steps: it.steps,
        })
        generatorKeys.set(it.generator_key, activities[activities.length - 1].id)
        created++
      }
      return { created, skipped }
    },
    async loadGeneratorContext(from, to) {
      track('loadGeneratorContext', [from, to])
      const keyOf = (id: string) => [...generatorKeys.entries()].find(([, v]) => v === id)?.[0] ?? null
      return {
        activities: activities
          .filter((a) => (a.study_day >= from && a.study_day <= to) || a.skill === 'lesson' || a.skill === 'music')
          .map((a) => ({ study_day: a.study_day, skill: a.skill, title: a.title, generator_key: keyOf(a.id) })),
        generatedKeys: [...generatorKeys.keys()],
      }
    },
    async reorderDay(planId, day, ids) {
      track('reorderDay', [planId, day, ids])
      ids.forEach((id, i) => {
        const a = activities.find((x) => x.id === id && x.plan_id === planId && x.study_day === day)
        if (a) a.position = i + 1
      })
    },
  }

  return {
    service,
    plans,
    activities,
    sessions,
    steps,
    generatorKeys,
    calls,
    failOn: (name: keyof ScheduleService) => failures.add(name),
    recover: (name: keyof ScheduleService) => failures.delete(name),
  }
}
