import { useId, useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { btn, field } from '../../components/ui/styles'
import { LEVELS, validateLesson, type LessonErrors, type LessonInput, type LessonValues } from './lesson-model'

export function LessonForm({
  initial,
  editing,
  busy,
  serverError,
  onSubmit,
  onClose,
}: {
  initial: LessonInput
  editing: boolean
  busy: boolean
  serverError: string | null
  onSubmit: (values: LessonValues) => void
  onClose: () => void
}) {
  const base = useId()
  const id = (k: keyof LessonInput) => `${base}-${k}`
  const [input, setInput] = useState<LessonInput>(initial)
  const [errors, setErrors] = useState<LessonErrors>({})

  const set = (k: keyof LessonInput, v: string) => {
    setInput((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }
  const a11y = (k: keyof LessonInput) => ({ id: id(k), 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `${id(k)}-error` : undefined })
  const err = (k: keyof LessonInput) =>
    errors[k] ? (
      <p id={`${id(k)}-error`} className={field.error}>
        {errors[k]}
      </p>
    ) : null

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const { values, errors: errs } = validateLesson(input)
    setErrors(errs)
    if (values) onSubmit(values)
  }

  return (
    <Modal title={editing ? 'Editar aula' : 'Nova aula'} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0">
            <label htmlFor={id('lessonNumber')} className={field.label}>
              Número
            </label>
            <input {...a11y('lessonNumber')} type="number" inputMode="numeric" min={1} className={field.input} value={input.lessonNumber} onChange={(e) => set('lessonNumber', e.target.value)} />
            {err('lessonNumber')}
          </div>
          <div className="min-w-0">
            <label htmlFor={id('level')} className={field.label}>
              Nível
            </label>
            <select {...a11y('level')} className={field.input} value={input.level} onChange={(e) => set('level', e.target.value)}>
              <option value="">—</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            {err('level')}
          </div>
        </div>
        <div>
          <label htmlFor={id('title')} className={field.label}>
            Título
          </label>
          <input {...a11y('title')} data-autofocus className={field.input} value={input.title} onChange={(e) => set('title', e.target.value)} />
          {err('title')}
        </div>
        <div>
          <label htmlFor={id('studiedOn')} className={field.label}>
            Data
          </label>
          <input {...a11y('studiedOn')} type="date" className={field.input} value={input.studiedOn} onChange={(e) => set('studiedOn', e.target.value)} />
          {err('studiedOn')}
        </div>
        <div>
          <label htmlFor={id('topics')} className={field.label}>
            Assuntos estudados <span className="font-normal text-slate-500">(um por linha ou separados por vírgula)</span>
          </label>
          <textarea {...a11y('topics')} rows={3} className={field.input} value={input.topics} onChange={(e) => set('topics', e.target.value)} />
          {err('topics')}
        </div>
        <div>
          <label htmlFor={id('report')} className={field.label}>
            Observações <span className="font-normal text-slate-500">(opcional)</span>
          </label>
          <textarea {...a11y('report')} rows={3} className={field.input} value={input.report} onChange={(e) => set('report', e.target.value)} />
          {err('report')}
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
            {busy ? 'Salvando…' : editing ? 'Salvar' : 'Criar aula'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
