import { useId } from 'react'
import { Plus } from 'lucide-react'
import { btn } from '../../components/ui/styles'
import { ActivityItem } from './ActivityItem'
import { LIMITS, type Activity, type Session, type Step } from './schedule-model'
import { formatDayLabel, type IsoDate } from './week'

export function DayColumn({
  day,
  isToday,
  activities,
  sessions,
  busy,
  onAdd,
  onMove,
  onEdit,
  onComplete,
  onReopen,
  onDelete,
  steps = {},
  onToggleStep,
}: {
  day: IsoDate
  isToday: boolean
  activities: Activity[]
  sessions: Record<string, Session>
  busy: boolean
  onAdd: () => void
  onMove: (activity: Activity, direction: -1 | 1) => void
  onEdit: (activity: Activity) => void
  onComplete: (activity: Activity) => void
  onReopen: (activity: Activity) => void
  onDelete: (activity: Activity) => void
  steps?: Record<string, Step[]>
  onToggleStep?: (activity: Activity, step: Step, completed: boolean) => void
}) {
  const headingId = useId()
  const full = activities.length >= LIMITS.perDayMax
  const plannedMinutes = activities.reduce((sum, a) => sum + a.planned_minutes, 0)

  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="font-semibold text-slate-900 first-letter:uppercase">
          {formatDayLabel(day)}
          {isToday && <span className="ml-2 rounded bg-indigo-600 px-1.5 py-0.5 text-xs font-medium text-white">hoje</span>}
        </h3>
        <span className="text-xs text-slate-500">
          {activities.length} {activities.length === 1 ? 'atividade' : 'atividades'} · {plannedMinutes} min previstos
        </span>
      </div>

      {activities.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">Nenhuma atividade neste dia.</p>
      ) : (
        <ol className="mb-3 space-y-2">
          {activities.map((a, i) => (
            <ActivityItem
              key={a.id}
              activity={a}
              session={sessions[a.id]}
              isFirst={i === 0}
              isLast={i === activities.length - 1}
              busy={busy}
              onMoveUp={() => onMove(a, -1)}
              onMoveDown={() => onMove(a, 1)}
              onEdit={() => onEdit(a)}
              onComplete={() => onComplete(a)}
              onReopen={() => onReopen(a)}
              onDelete={() => onDelete(a)}
              steps={steps[a.id] ?? []}
              onToggleStep={onToggleStep ? (st, done) => onToggleStep(a, st, done) : undefined}
            />
          ))}
        </ol>
      )}

      <button
        type="button"
        className={btn.secondary}
        onClick={onAdd}
        disabled={busy || full}
        aria-label={`Adicionar atividade em ${formatDayLabel(day)}`}
      >
        <Plus className="size-4" aria-hidden="true" />
        Adicionar atividade
      </button>
      {full && <p className="mt-1 text-xs text-slate-500">Limite de {LIMITS.perDayMax} atividades por dia atingido.</p>}
    </section>
  )
}
