import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarPlus, Sparkles, Wand2 } from 'lucide-react'
import { ErrorState } from '../../components/ui/ErrorState'
import { LoadingState } from '../../components/ui/LoadingState'
import { PageHeader } from '../../components/ui/PageHeader'
import { btn } from '../../components/ui/styles'
import { useAuth } from '../auth/auth-context'
import { ActivityForm } from './ActivityForm'
import { CompleteActivityDialog } from './CompleteActivityDialog'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import { DayColumn } from './DayColumn'
import { GeneratorDialog } from './GeneratorDialog'
import { useScheduleService } from './schedule-context'
import {
  activitiesOfDay,
  weekProgressPercent,
  type Activity,
  type ActivityValues,
  type Step,
  type StepValues,
  type WeekData,
} from './schedule-model'
import { useWeeklySchedule } from './useWeeklySchedule'
import { WeekNavigation } from './WeekNavigation'
import { addDays, civilDateInZone, currentWeekStart, weekDays, weekStartOf, type IsoDate } from './week'

type Dialog =
  | { kind: 'create'; day: IsoDate }
  | { kind: 'edit'; activity: Activity }
  | { kind: 'complete'; activity: Activity }
  | { kind: 'delete'; activity: Activity }
  | { kind: 'lastStep'; activity: Activity; step: Step }
  | { kind: 'generate' }
  | null

function parseWeekParam(value: string | null): IsoDate | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null
  return weekStartOf(value)
}

function Summary({ data }: { data: WeekData }) {
  const s = data.summary
  const pct = weekProgressPercent(s)
  return (
    <dl className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Resumo da semana">
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
        <dt className="text-sm text-slate-600">Previsto</dt>
        <dd className="mt-1 text-lg font-semibold tabular-nums">
          {s.planned_count} {s.planned_count === 1 ? 'atividade' : 'atividades'} · {s.planned_minutes} min
        </dd>
      </div>
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
        <dt className="text-sm text-slate-600">Concluídas</dt>
        <dd className="mt-1 text-lg font-semibold tabular-nums">
          {s.completed_count} de {s.planned_count} ({pct}%)
        </dd>
      </div>
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
        <dt className="text-sm text-slate-600">Minutos registrados</dt>
        <dd className="mt-1 text-lg font-semibold tabular-nums">{s.completed_minutes} min</dd>
      </div>
    </dl>
  )
}

export function SchedulePage() {
  const service = useScheduleService()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  // "Hoje" no fuso do app, capturado na montagem da página.
  const [{ today, thisWeek }] = useState(() => {
    const now = new Date()
    return { today: civilDateInZone(now), thisWeek: currentWeekStart(now) }
  })
  const weekStart = parseWeekParam(params.get('week')) ?? thisWeek
  const isCurrentWeek = weekStart === thisWeek

  const { state, busy, actionError, notice, run, reload, clearActionError } = useWeeklySchedule(weekStart)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [generatedMsg, setGeneratedMsg] = useState<string | null>(null)

  const goTo = (week: IsoDate) => {
    setDialog(null)
    setGeneratedMsg(null)
    clearActionError()
    setParams(week === thisWeek ? {} : { week })
  }

  const openDialog = (d: Dialog) => {
    clearActionError()
    setGeneratedMsg(null)
    setDialog(d)
  }
  const closeDialog = () => {
    if (!busy) setDialog(null)
  }

  const data = state.status === 'ready' ? state.data : null
  const plan = data?.plan ?? null
  const countByDay: Record<IsoDate, number> = {}
  for (const a of data?.activities ?? []) countByDay[a.study_day] = (countByDay[a.study_day] ?? 0) + 1

  // Criação/edição da atividade e das etapas numa única operação (RPC atômica).
  const submitActivity = async (values: ActivityValues, steps: StepValues[]) => {
    if (!plan || !user || !dialog || (dialog.kind !== 'edit' && dialog.kind !== 'create')) return
    const editing = dialog.kind === 'edit'
    const ok = await run(
      () => service.saveActivity({ activityId: editing ? dialog.activity.id : null, planId: plan.id, values, steps }),
      editing ? 'Atividade atualizada.' : 'Atividade criada.',
    )
    if (ok) setDialog(null)
  }

  // Marcar a ÚLTIMA etapa pendente conclui a atividade: pede antes os minutos reais (regra da ET-002).
  const toggleStep = (activity: Activity, step: Step, completed: boolean) => {
    const steps = data?.steps[activity.id] ?? []
    const othersDone = steps.filter((st) => st.id !== step.id).every((st) => st.is_completed)
    const parentDone = !!data?.sessions[activity.id]?.is_completed
    if (completed && othersDone && !parentDone) {
      openDialog({ kind: 'lastStep', activity, step })
      return
    }
    void run(() => service.setStepCompleted(step.id, completed), completed ? 'Etapa concluída.' : 'Etapa reaberta.')
  }

  const move = (activity: Activity, direction: -1 | 1) => {
    if (!plan || !data) return
    const list = activitiesOfDay(data.activities, activity.study_day)
    const i = list.findIndex((a) => a.id === activity.id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= list.length) return
    const ids = list.map((a) => a.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void run(() => service.reorderDay(plan.id, activity.study_day, ids), 'Ordem atualizada.')
  }

  return (
    <section>
      <PageHeader title="Cronograma" description="Planeje a semana e registre o que foi estudado." />

      <div className="mb-4">
        <button type="button" className={btn.secondary} onClick={() => openDialog({ kind: 'generate' })} disabled={busy}>
          <Wand2 className="size-4" aria-hidden="true" />
          Gerar cronograma semanal
        </button>
      </div>

      <WeekNavigation
        weekStart={weekStart}
        isCurrentWeek={isCurrentWeek}
        onPrevious={() => goTo(addDays(weekStart, -7))}
        onToday={() => goTo(thisWeek)}
        onNext={() => goTo(addDays(weekStart, 7))}
      />

      {/* Região de status persistente: anuncia o sucesso somente após confirmação do servidor. */}
      <div role="status" aria-live="polite">
        {(notice ?? generatedMsg) && !busy && !dialog && (
          <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice ?? generatedMsg}</p>
        )}
      </div>
      {actionError && !dialog && (
        <div className="mb-4">
          <ErrorState message={actionError} />
        </div>
      )}

      {state.status === 'loading' && <LoadingState label="Carregando semana…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={reload} />}

      {data && !plan && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
          <p className="font-medium text-slate-900">Nenhum plano para esta semana.</p>
          <p className="mt-1 text-sm text-slate-600">
            Nada é criado automaticamente. Escolha uma opção abaixo para começar.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {isCurrentWeek && (
              <button
                type="button"
                className={btn.primary}
                disabled={busy}
                onClick={() => void run(() => service.createInitialPlan(), 'Plano inicial criado.')}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                Criar meu plano inicial
              </button>
            )}
            <button
              type="button"
              className={btn.secondary}
              disabled={busy || !user}
              onClick={() => user && void run(() => service.createEmptyPlan(user.id, weekStart), 'Plano vazio criado.')}
            >
              <CalendarPlus className="size-4" aria-hidden="true" />
              Criar plano vazio
            </button>
          </div>
          {isCurrentWeek && (
            <p className="mt-3 text-xs text-slate-500">
              O plano inicial cria 5 atividades na segunda-feira (60 min no total). Os demais dias ficam vazios e editáveis.
            </p>
          )}
        </div>
      )}

      {data && plan && (
        <>
          <Summary data={data} />
          {data.activities.length === 0 && (
            <p className="mb-4 text-sm text-slate-600">Plano vazio: adicione atividades nos dias desejados.</p>
          )}
          <div className="space-y-4">
            {weekDays(weekStart).map((day) => (
              <DayColumn
                key={day}
                day={day}
                isToday={day === today}
                activities={activitiesOfDay(data.activities, day)}
                sessions={data.sessions}
                busy={busy}
                onAdd={() => openDialog({ kind: 'create', day })}
                onMove={move}
                onEdit={(activity) => openDialog({ kind: 'edit', activity })}
                onComplete={(activity) => openDialog({ kind: 'complete', activity })}
                onReopen={(activity) => void run(() => service.reopenActivity(activity.id), 'Atividade reaberta.')}
                onDelete={(activity) => openDialog({ kind: 'delete', activity })}
                steps={data.steps}
                onToggleStep={toggleStep}
              />
            ))}
          </div>
        </>
      )}

      {plan && (dialog?.kind === 'create' || dialog?.kind === 'edit') && (
        <ActivityForm
          weekStart={weekStart}
          activity={dialog.kind === 'edit' ? dialog.activity : undefined}
          steps={dialog.kind === 'edit' ? (data?.steps[dialog.activity.id] ?? []) : []}
          defaultDay={dialog.kind === 'create' ? dialog.day : dialog.activity.study_day}
          countByDay={countByDay}
          busy={busy}
          serverError={actionError}
          onSubmit={(values, steps) => void submitActivity(values, steps)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'complete' && (
        <CompleteActivityDialog
          activity={dialog.activity}
          busy={busy}
          serverError={actionError}
          onConfirm={async (minutes) => {
            const ok = await run(() => service.completeActivity(dialog.activity.id, minutes), 'Atividade concluída.')
            if (ok) setDialog(null)
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'lastStep' && (
        <CompleteActivityDialog
          activity={dialog.activity}
          heading="Concluir última etapa"
          note={`“${dialog.step.title}” é a última etapa de “${dialog.activity.title}”. Ao confirmar, a atividade é concluída com os minutos reais informados (previsto: ${dialog.activity.planned_minutes} min).`}
          busy={busy}
          serverError={actionError}
          onConfirm={async (minutes) => {
            const ok = await run(() => service.setStepCompleted(dialog.step.id, true, minutes), 'Atividade concluída.')
            if (ok) setDialog(null)
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'generate' && (
        <GeneratorDialog
          defaultStart={today}
          onClose={() => setDialog(null)}
          onGenerated={({ created, skipped, startDate }) => {
            const target = weekStartOf(startDate)
            setDialog(null)
            if (target !== weekStart) setParams(target === thisWeek ? {} : { week: target })
            else reload()
            setGeneratedMsg(
              `Cronograma gerado: ${created} ${created === 1 ? 'atividade criada' : 'atividades criadas'}${skipped ? `, ${skipped} já ${skipped === 1 ? 'existia' : 'existiam'} (não duplicada${skipped === 1 ? '' : 's'})` : ''}.`,
            )
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDeleteDialog
          activity={dialog.activity}
          busy={busy}
          serverError={actionError}
          onConfirm={async () => {
            const ok = await run(() => service.deleteActivity(dialog.activity.id), 'Atividade excluída.')
            if (ok) setDialog(null)
          }}
          onClose={closeDialog}
        />
      )}
    </section>
  )
}
