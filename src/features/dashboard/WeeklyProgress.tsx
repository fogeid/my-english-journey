import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, CheckCircle2, Timer, TrendingUp } from 'lucide-react'
import { ErrorState } from '../../components/ui/ErrorState'
import { LoadingState } from '../../components/ui/LoadingState'
import { useScheduleService } from '../schedule/schedule-context'
import { weekProgressPercent, type WeekSummary } from '../schedule/schedule-model'
import { currentWeekStart, formatWeekRange } from '../schedule/week'

type Result = { key: string } & ({ status: 'ready'; summary: WeekSummary } | { status: 'error' })

/**
 * Indicadores da semana ATUAL, agregados pela semana planejada (não pela data de conclusão).
 * Só conta execuções concluídas. Falha => erro, nunca zero inventado.
 */
export function WeeklyProgress() {
  const service = useScheduleService()
  const weekStart = currentWeekStart()
  const [reloadKey, setReloadKey] = useState(0)
  const key = `${weekStart}:${reloadKey}`
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    let active = true
    service
      .getWeekSummary(weekStart)
      .then((summary) => active && setResult({ key, status: 'ready', summary }))
      .catch(() => active && setResult({ key, status: 'error' }))
    return () => {
      active = false
    }
  }, [service, weekStart, key])

  const current = result && result.key === key ? result : null

  return (
    <section aria-labelledby="weekly-progress-heading" className="mb-6">
      <h2 id="weekly-progress-heading" className="mb-1 text-lg font-semibold text-slate-900">
        Esta semana
      </h2>
      <p className="mb-3 text-sm text-slate-600">{formatWeekRange(weekStart)}</p>

      {!current && <LoadingState label="Carregando indicadores da semana…" />}
      {current?.status === 'error' && (
        <ErrorState message="Não foi possível carregar os indicadores da semana." onRetry={() => setReloadKey((k) => k + 1)} />
      )}
      {current?.status === 'ready' && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4" aria-label="Indicadores da semana">
            <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <dt className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <CheckCircle2 className="size-4 shrink-0 text-indigo-600" aria-hidden="true" />
                <span className="min-w-0 break-words">Atividades concluídas</span>
              </dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 sm:text-3xl">{current.summary.completed_count}</dd>
            </div>
            <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <dt className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Timer className="size-4 shrink-0 text-indigo-600" aria-hidden="true" />
                <span className="min-w-0 break-words">Minutos registrados</span>
              </dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 sm:text-3xl">{current.summary.completed_minutes} min</dd>
            </div>
            <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <dt className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <TrendingUp className="size-4 shrink-0 text-indigo-600" aria-hidden="true" />
                <span className="min-w-0 break-words">Progresso semanal</span>
              </dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 sm:text-3xl">{weekProgressPercent(current.summary)}%</dd>
              <dd className="mt-1 text-xs text-slate-500">
                {current.summary.planned_count > 0
                  ? `${current.summary.completed_count} de ${current.summary.planned_count} atividades planejadas`
                  : current.summary.has_plan
                    ? 'Plano sem atividades nesta semana'
                    : 'Sem plano para esta semana'}
              </dd>
            </div>
          </dl>
          {!current.summary.has_plan && (
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <CalendarCheck className="size-4 shrink-0" aria-hidden="true" />
              <span>
                Crie o plano da semana no{' '}
                <Link to="/schedule" className="font-medium text-indigo-700 underline">
                  Cronograma
                </Link>
                .
              </span>
            </p>
          )}
        </>
      )}
    </section>
  )
}
