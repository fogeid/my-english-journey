import { useId, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { btn, field } from '../../components/ui/styles'
import {
  CATEGORY_LABELS,
  LIMITS,
  MVP_CATEGORIES,
  sortSteps,
  validateActivity,
  validateSteps,
  type Activity,
  type ActivityErrors,
  type ActivityInput,
  type ActivityValues,
  type Step,
  type StepErrors,
  type StepInput,
  type StepValues,
} from './schedule-model'
import { formatDayLabel, weekDays, type IsoDate } from './week'

let stepKeySeq = 0
const newStepKey = () => `new-${++stepKeySeq}`

export function ActivityForm({
  weekStart,
  activity,
  steps: existingSteps = [],
  defaultDay,
  countByDay,
  busy,
  serverError,
  onSubmit,
  onClose,
}: {
  weekStart: IsoDate
  /** atividade em edição; ausente = criação */
  activity?: Activity
  /** etapas existentes da atividade em edição */
  steps?: Step[]
  defaultDay: IsoDate
  countByDay: Record<IsoDate, number>
  busy: boolean
  serverError: string | null
  onSubmit: (values: ActivityValues, steps: StepValues[]) => void
  onClose: () => void
}) {
  const ids = {
    title: useId(),
    description: useId(),
    skill: useId(),
    day: useId(),
    minutes: useId(),
  }
  const [input, setInput] = useState<ActivityInput>({
    title: activity?.title ?? '',
    description: activity?.description ?? '',
    skill: activity?.skill ?? '',
    plannedMinutes: activity ? String(activity.planned_minutes) : '',
    studyDay: activity?.study_day ?? defaultDay,
  })
  const [errors, setErrors] = useState<ActivityErrors>({})
  const [steps, setSteps] = useState<StepInput[]>(() =>
    sortSteps(existingSteps).map((st) => ({
      key: st.id,
      id: st.id,
      title: st.title,
      description: st.description ?? '',
      plannedMinutes: String(st.planned_minutes),
    })),
  )
  const [stepErrors, setStepErrors] = useState<StepErrors>({})
  const [stepsFormError, setStepsFormError] = useState<string | null>(null)
  const stepsCheck = validateSteps(steps)
  const hasSteps = steps.length > 0

  const updateStep = (key: string, patch: Partial<StepInput>) => {
    setSteps((prev) => prev.map((st) => (st.key === key ? { ...st, ...patch } : st)))
    setStepErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }
  const moveStep = (index: number, delta: -1 | 1) =>
    setSteps((prev) => {
      const j = index + delta
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const tmp = next[index]
      next[index] = next[j]
      next[j] = tmp
      return next
    })
  const addStep = () => {
    setSteps((prev) => [...prev, { key: newStepKey(), title: '', description: '', plannedMinutes: '' }])
    setStepsFormError(null)
  }
  const removeStep = (key: string) => setSteps((prev) => prev.filter((st) => st.key !== key))

  // Categoria legada (ex.: 'writing') de uma atividade existente continua selecionável só nela.
  const skills: string[] = [...MVP_CATEGORIES]
  if (activity && !skills.includes(activity.skill)) skills.push(activity.skill)

  const set = <K extends keyof ActivityInput>(k: K, v: ActivityInput[K]) => {
    setInput((prev) => ({ ...prev, [k]: v }))
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }))
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const sameDay = activity && activity.study_day === input.studyDay
    const countOnTargetDay = (countByDay[input.studyDay] ?? 0) - (sameDay ? 1 : 0)
    const st = validateSteps(steps)
    setStepErrors(st.errors)
    setStepsFormError(st.formError)
    const { values, errors: errs } = validateActivity(input, {
      weekStart,
      countOnTargetDay,
      allowedSkills: skills,
      stepsTotal: hasSteps ? st.total : null,
    })
    setErrors(errs)
    if (values && st.values) onSubmit(values, st.values)
  }

  const fieldId: Record<keyof ActivityInput, string> = {
    title: ids.title,
    description: ids.description,
    skill: ids.skill,
    plannedMinutes: ids.minutes,
    studyDay: ids.day,
  }
  const describedBy = (k: keyof ActivityInput, hint?: string) =>
    [errors[k] ? `${fieldId[k]}-error` : null, hint].filter(Boolean).join(' ') || undefined

  return (
    <Modal title={activity ? 'Editar atividade' : 'Nova atividade'} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor={ids.title} className={field.label}>
            Título
          </label>
          <input
            id={ids.title}
            data-autofocus
            className={field.input}
            value={input.title}
            maxLength={LIMITS.titleMax + 20}
            onChange={(e) => set('title', e.target.value)}
            aria-invalid={!!errors.title}
            aria-describedby={describedBy('title')}
          />
          {errors.title && (
            <p id={`${ids.title}-error`} className={field.error}>
              {errors.title}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={ids.description} className={field.label}>
            Descrição <span className="font-normal text-slate-500">(opcional)</span>
          </label>
          <textarea
            id={ids.description}
            rows={3}
            className={field.input}
            value={input.description}
            onChange={(e) => set('description', e.target.value)}
            aria-invalid={!!errors.description}
            aria-describedby={describedBy('description')}
          />
          {errors.description && (
            <p id={`${ids.description}-error`} className={field.error}>
              {errors.description}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={ids.skill} className={field.label}>
              Categoria
            </label>
            <select
              id={ids.skill}
              className={field.input}
              value={input.skill}
              onChange={(e) => set('skill', e.target.value)}
              aria-invalid={!!errors.skill}
              aria-describedby={describedBy('skill')}
            >
              <option value="">Selecione…</option>
              {skills.map((s) => (
                <option key={s} value={s}>
                  {CATEGORY_LABELS[s] ?? s}
                </option>
              ))}
            </select>
            {errors.skill && (
              <p id={`${ids.skill}-error`} className={field.error}>
                {errors.skill}
              </p>
            )}
          </div>

          <div className="min-w-0">
            <label htmlFor={ids.minutes} className={field.label}>
              Minutos previstos
            </label>
            <input
              id={ids.minutes}
              type="number"
              inputMode="numeric"
              min={LIMITS.plannedMin}
              max={LIMITS.plannedMax}
              step={1}
              className={field.input}
              value={hasSteps ? String(stepsCheck.total) : input.plannedMinutes}
              readOnly={hasSteps}
              disabled={hasSteps}
              onChange={(e) => set('plannedMinutes', e.target.value)}
              aria-invalid={!!errors.plannedMinutes}
              aria-describedby={describedBy('plannedMinutes', `${ids.minutes}-hint`)}
            />
            <p id={`${ids.minutes}-hint`} className={field.hint}>
              {hasSteps ? 'Soma das subatividades (calculada).' : `De ${LIMITS.plannedMin} a ${LIMITS.plannedMax}.`}
            </p>
            {errors.plannedMinutes && (
              <p id={`${ids.minutes}-error`} className={field.error}>
                {errors.plannedMinutes}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor={ids.day} className={field.label}>
            Dia
          </label>
          <select
            id={ids.day}
            className={field.input}
            value={input.studyDay}
            onChange={(e) => set('studyDay', e.target.value)}
            aria-invalid={!!errors.studyDay}
            aria-describedby={describedBy('studyDay')}
          >
            {weekDays(weekStart).map((d) => (
              <option key={d} value={d}>
                {formatDayLabel(d)}
              </option>
            ))}
          </select>
          {errors.studyDay && (
            <p id={`${ids.day}-error`} className={field.error}>
              {errors.studyDay}
            </p>
          )}
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">
            Subatividades <span className="font-normal text-slate-500">(opcional)</span>
          </legend>
          <p className="mb-2 text-xs text-slate-600" aria-live="polite">
            {hasSteps
              ? `${steps.length} ${steps.length === 1 ? 'etapa' : 'etapas'} · total ${stepsCheck.total} min`
              : 'Sem etapas: a atividade usa os minutos previstos acima.'}
          </p>
          <ol className="space-y-3">
            {steps.map((st, i) => {
              const e = stepErrors[st.key] ?? {}
              const base = `${ids.title}-step-${st.key}`
              return (
                <li key={st.key} className="rounded-md bg-slate-50 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-600">Etapa {i + 1}</span>
                    <span className="flex gap-1">
                      <button type="button" className={btn.icon} onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label={`Mover etapa ${i + 1} para cima`}>
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </button>
                      <button type="button" className={btn.icon} onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} aria-label={`Mover etapa ${i + 1} para baixo`}>
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </button>
                      <button type="button" className={`${btn.icon} text-red-700`} onClick={() => removeStep(st.key)} aria-label={`Remover etapa ${i + 1}`}>
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                    <div className="min-w-0">
                      <label htmlFor={`${base}-t`} className="sr-only">
                        Título da etapa {i + 1}
                      </label>
                      <input
                        id={`${base}-t`}
                        placeholder="Título da etapa"
                        className={field.input}
                        value={st.title}
                        onChange={(ev) => updateStep(st.key, { title: ev.target.value })}
                        aria-invalid={!!e.title}
                        aria-describedby={e.title ? `${base}-te` : undefined}
                      />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`${base}-m`} className="sr-only">
                        Minutos da etapa {i + 1}
                      </label>
                      <input
                        id={`${base}-m`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={LIMITS.plannedMax}
                        placeholder="min"
                        className={field.input}
                        value={st.plannedMinutes}
                        onChange={(ev) => updateStep(st.key, { plannedMinutes: ev.target.value })}
                        aria-invalid={!!e.plannedMinutes}
                        aria-describedby={e.plannedMinutes ? `${base}-me` : undefined}
                      />
                    </div>
                  </div>
                  {e.title && (
                    <p id={`${base}-te`} className={field.error}>
                      {e.title}
                    </p>
                  )}
                  {e.plannedMinutes && (
                    <p id={`${base}-me`} className={field.error}>
                      {e.plannedMinutes}
                    </p>
                  )}
                  <label htmlFor={`${base}-d`} className="sr-only">
                    Descrição da etapa {i + 1}
                  </label>
                  <textarea
                    id={`${base}-d`}
                    rows={2}
                    placeholder="Descrição (opcional)"
                    className={`${field.input} mt-2`}
                    value={st.description}
                    onChange={(ev) => updateStep(st.key, { description: ev.target.value })}
                    aria-invalid={!!e.description}
                  />
                  {e.description && <p className={field.error}>{e.description}</p>}
                </li>
              )
            })}
          </ol>
          {stepsFormError && <p className={field.error}>{stepsFormError}</p>}
          <button type="button" className={`${btn.secondary} mt-3`} onClick={addStep} disabled={steps.length >= LIMITS.stepsMax}>
            <Plus className="size-4" aria-hidden="true" />
            Adicionar subatividade
          </button>
        </fieldset>

        {serverError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {serverError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className={btn.primary} disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
