import { Modal } from '../../components/ui/Modal'
import { btn } from '../../components/ui/styles'
import type { Activity } from './schedule-model'

export function ConfirmDeleteDialog({
  activity,
  busy,
  serverError,
  onConfirm,
  onClose,
}: {
  activity: Activity
  busy: boolean
  serverError: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title="Excluir atividade?"
      description={`“${activity.title}” será removida deste plano. Esta ação não pode ser desfeita.`}
      onClose={onClose}
      closeDisabled={busy}
    >
      {serverError && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {serverError}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={btn.secondary} onClick={onClose} disabled={busy} data-autofocus>
          Cancelar
        </button>
        <button type="button" className={btn.danger} onClick={onConfirm} disabled={busy}>
          {busy ? 'Excluindo…' : 'Excluir'}
        </button>
      </div>
    </Modal>
  )
}
