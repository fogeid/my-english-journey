import { useId, useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { btn, field } from '../../components/ui/styles'
import {
  CATEGORY_LABELS,
  LIMITS,
  MVP_CATEGORIES,
  validateActivity,
  type Activity,
  type ActivityErrors,
  type ActivityInput,
  type ActivityValues,
} from './schedule-model'
import { formatDayLabel, weekDays, type IsoDate } from './week'

export function ActivityForm({
  weekStart,
  activity,
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
  defaultDay: IsoDate
  countByDay: Record<IsoDate, number>
  busy: boolean
  serverError: string | null
  onSubmit: (values: ActivityValues) => void
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
    const { values, errors: errs } = validateActivity(input, { weekStart, countOnTargetDay, allowedSkills: skills })
    setErrors(errs)
    if (values) onSubmit(values)
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
              value={input.plannedMinutes}
              onChange={(e) => set('plannedMinutes', e.target.value)}
              aria-invalid={!!errors.plannedMinutes}
              aria-describedby={describedBy('plannedMinutes', `${ids.minutes}-hint`)}
            />
            <p id={`${ids.minutes}-hint`} className={field.hint}>
              De {LIMITS.plannedMin} a {LIMITS.plannedMax}.
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
