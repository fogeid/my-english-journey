import { useId, useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { btn, field } from '../../components/ui/styles'
import { validateExercise, type ExerciseErrors, type ExerciseInput, type ExerciseValues } from './lesson-model'

const FIELDS: { key: keyof ExerciseInput; label: string; optional?: boolean; rows: number }[] = [
  { key: 'prompt', label: 'Enunciado', rows: 3 },
  { key: 'myAnswer', label: 'Minha resposta', optional: true, rows: 2 },
  { key: 'correctedAnswer', label: 'Resposta corrigida', optional: true, rows: 2 },
  { key: 'explanation', label: 'Explicação', optional: true, rows: 3 },
]

export function ExerciseForm({
  blockLabel,
  initial,
  busy,
  serverError,
  onSubmit,
  onClose,
}: {
  blockLabel: string
  initial?: ExerciseInput
  busy: boolean
  serverError: string | null
  onSubmit: (values: ExerciseValues) => void
  onClose: () => void
}) {
  const base = useId()
  const [input, setInput] = useState<ExerciseInput>(initial ?? { prompt: '', myAnswer: '', correctedAnswer: '', explanation: '' })
  const [errors, setErrors] = useState<ExerciseErrors>({})

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const { values, errors: errs } = validateExercise(input)
    setErrors(errs)
    if (values) onSubmit(values)
  }

  return (
    <Modal title={initial ? 'Editar exercício' : 'Novo exercício'} description={`Bloco: ${blockLabel}`} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {FIELDS.map((f, i) => {
          const id = `${base}-${f.key}`
          return (
            <div key={f.key}>
              <label htmlFor={id} className={field.label}>
                {f.label} {f.optional && <span className="font-normal text-slate-500">(opcional)</span>}
              </label>
              <textarea
                id={id}
                rows={f.rows}
                data-autofocus={i === 0 ? true : undefined}
                className={field.input}
                value={input[f.key]}
                onChange={(e) => {
                  setInput((p) => ({ ...p, [f.key]: e.target.value }))
                  if (errors[f.key]) setErrors((p) => ({ ...p, [f.key]: undefined }))
                }}
                aria-invalid={!!errors[f.key]}
                aria-describedby={errors[f.key] ? `${id}-error` : undefined}
              />
              {errors[f.key] && (
                <p id={`${id}-error`} className={field.error}>
                  {errors[f.key]}
                </p>
              )}
            </div>
          )
        })}
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
