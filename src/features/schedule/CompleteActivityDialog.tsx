import { useId, useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { btn, field } from '../../components/ui/styles'
import { LIMITS, validateActualMinutes, type Activity } from './schedule-model'

/**
 * Conclusão: os minutos reais são SEMPRE confirmados explicitamente pelo usuário.
 * O campo vem sugerido com o tempo previsto, mas nada é registrado sem clicar em "Confirmar".
 */
export function CompleteActivityDialog({
  activity,
  busy,
  serverError,
  onConfirm,
  onClose,
  heading,
  note,
}: {
  activity: Activity
  /** título/descrição alternativos (ex.: conclusão pela última etapa — ET-007) */
  heading?: string
  note?: string
  busy: boolean
  serverError: string | null
  onConfirm: (actualMinutes: number) => void
  onClose: () => void
}) {
  const inputId = useId()
  const [raw, setRaw] = useState(String(activity.planned_minutes))
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const { value, error: err } = validateActualMinutes(raw)
    setError(err)
    if (value !== null) onConfirm(value)
  }

  return (
    <Modal
      title={heading ?? 'Concluir atividade'}
      description={note ?? `“${activity.title}” — previsto: ${activity.planned_minutes} min.`}
      onClose={onClose}
      closeDisabled={busy}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor={inputId} className={field.label}>
            Minutos realmente estudados
          </label>
          <input
            id={inputId}
            data-autofocus
            type="number"
            inputMode="numeric"
            min={LIMITS.actualMin}
            max={LIMITS.actualMax}
            step={1}
            className={field.input}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value)
              setError(null)
            }}
            aria-invalid={!!error}
            aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ''}`}
          />
          <p id={`${inputId}-hint`} className={field.hint}>
            Sugestão: o tempo previsto. Ajuste para o tempo real (0 a {LIMITS.actualMax}). Use 0 para concluir sem tempo medido.
          </p>
          {error && (
            <p id={`${inputId}-error`} className={field.error}>
              {error}
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
            {busy ? 'Salvando…' : 'Confirmar conclusão'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
