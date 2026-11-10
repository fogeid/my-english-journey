import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronRight, Circle, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { btn } from '../../components/ui/styles'
import { CATEGORY_LABELS, sortSteps, stepsProgress, type Activity, type Session, type Step } from './schedule-model'
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
  steps = [],
  onToggleStep,
}: {
  activity: Activity
  session: Session | undefined
  /** etapas da atividade (vazio = atividade simples, comportamento da ET-002) */
  steps?: Step[]
  onToggleStep?: (step: Step, completed: boolean) => void
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
  const stepsId = useId()
  const hasHistory = !!session
  const completed = !!session?.is_completed
  const [expanded, setExpanded] = useState(false)
  const ordered = sortSteps(steps)
  const progress = stepsProgress(ordered)

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
          {ordered.length > 0 && (
            <div className="mt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className={`${btn.ghost} -ml-2`}
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  aria-controls={stepsId}
                  aria-label={`${expanded ? 'Recolher' : 'Expandir'} etapas de “${activity.title}”`}
                >
                  {expanded ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
                  {progress.done}/{progress.total} etapas
                </button>
                <span className="text-xs tabular-nums text-slate-500">{progress.percent}%</span>
              </div>
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label={`Progresso de “${activity.title}”`}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                aria-valuetext={`${progress.done} de ${progress.total} etapas concluídas`}
              >
                <div className="h-full rounded-full bg-indigo-600" style={{ width: `${progress.percent}%` }} />
              </div>
              {expanded && (
                <ol id={stepsId} className="mt-2 space-y-1" aria-label={`Etapas de “${activity.title}”`}>
                  {ordered.map((st) => (
                    <li key={st.id} className="rounded-md px-1 py-1 hover:bg-slate-50">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 shrink-0 accent-indigo-600"
                          checked={st.is_completed}
                          disabled={busy || !onToggleStep}
                          onChange={(e) => onToggleStep?.(st, e.target.checked)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className={`block break-words text-sm ${st.is_completed ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                            {st.title} <span className="text-xs text-slate-500 no-underline">· {st.planned_minutes} min</span>
                          </span>
                          {st.description && <span className="block break-words text-xs text-slate-600">{st.description}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ol>
              )}
            </div>
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
