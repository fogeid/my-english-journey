import { Modal } from './Modal'
import { btn } from './styles'

/** Confirmação explícita antes de ações destrutivas. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Excluir',
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string
  description: string
  confirmLabel?: string
  busy: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal title={title} description={description} onClose={onClose} closeDisabled={busy}>
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={btn.secondary} onClick={onClose} disabled={busy} data-autofocus>
          Cancelar
        </button>
        <button type="button" className={btn.danger} onClick={onConfirm} disabled={busy}>
          {busy ? 'Aguarde…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
