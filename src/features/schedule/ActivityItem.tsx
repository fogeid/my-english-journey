import { useId } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, Circle, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { btn } from '../../components/ui/styles'
import { CATEGORY_LABELS, type Activity, type Session } from './schedule-model'
import { formatDateTime } from './week'

function StatusLine({ session }: { session: Session | undefined }) {
  if (!session) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-slate-600">
        <Circle className="size-4 shrink-0" aria-hidden="true" />
        Pendente
      </p>
    )
  }
  if (session.is_completed) {
    return (
      <p className="flex items-start gap-1.5 text-sm text-emerald-700">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Concluída em {formatDateTime(session.completed_at)} · {session.actual_minutes} min registrados
        </span>
      </p>
    )
  }
  return (
    <p className="flex items-start gap-1.5 text-sm text-amber-700">
      <RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        Reaberta{session.reopened_at ? ` em ${formatDateTime(session.reopened_at)}` : ''} · último registro:{' '}
        {session.actual_minutes} min (não conta como concluída)
      </span>
    </p>
  )
}

export function ActivityItem({
  activity,
  session,
  isFirst,
  isLast,
  busy,
  onMoveUp,
  onMoveDown,
  onEdit,
  onComplete,
  onReopen,
  onDelete,
}: {
  activity: Activity
  session: Session | undefined
  isFirst: boolean
  isLast: boolean
  busy: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onEdit: () => void
  onComplete: () => void
  onReopen: () => void
  onDelete: () => void
}) {
  const titleId = useId()
  const lockedId = useId()
  const hasHistory = !!session
  const completed = !!session?.is_completed

  return (
    <li aria-labelledby={titleId} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 id={titleId} className="min-w-0 break-words font-medium text-slate-900">
              {activity.title}
            </h4>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {CATEGORY_LABELS[activity.skill] ?? activity.skill}
            </span>
            <span className="text-xs text-slate-500">{activity.planned_minutes} min previstos</span>
          </div>
          {activity.description && (
            <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-600">{activity.description}</p>
          )}
          <div className="mt-2">
            <StatusLine session={session} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            className={btn.icon}
            onClick={onMoveUp}
            disabled={busy || isFirst}
            aria-label={`Mover “${activity.title}” para cima`}
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={btn.icon}
            onClick={onMoveDown}
            disabled={busy || isLast}
            aria-label={`Mover “${activity.title}” para baixo`}
          >
            <ArrowDown className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
        <button type="button" className={btn.ghost} onClick={onEdit} disabled={busy} aria-label={`Editar “${activity.title}”`}>
          <Pencil className="size-4" aria-hidden="true" />
          Editar
        </button>
        {completed ? (
          <button type="button" className={btn.ghost} onClick={onReopen} disabled={busy} aria-label={`Reabrir “${activity.title}”`}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Reabrir
          </button>
        ) : (
          <button type="button" className={btn.ghost} onClick={onComplete} disabled={busy} aria-label={`Concluir “${activity.title}”`}>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Concluir
          </button>
        )}
        <button
          type="button"
          className={`${btn.ghost} text-red-700 hover:bg-red-50`}
          onClick={onDelete}
          disabled={busy || hasHistory}
          aria-label={`Excluir “${activity.title}”`}
          aria-describedby={hasHistory ? lockedId : undefined}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Excluir
        </button>
      </div>
      {hasHistory && (
        <p id={lockedId} className="mt-1 text-xs text-slate-500">
          Não pode ser excluída: possui execução registrada (histórico preservado).
        </p>
      )}
    </li>
  )
}
