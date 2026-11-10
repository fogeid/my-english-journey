import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { btn } from '../../components/ui/styles'
import { formatWeekRange, type IsoDate } from './week'

export function WeekNavigation({
  weekStart,
  isCurrentWeek,
  onPrevious,
  onToday,
  onNext,
}: {
  weekStart: IsoDate
  isCurrentWeek: boolean
  onPrevious: () => void
  onToday: () => void
  onNext: () => void
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-lg font-semibold text-slate-900" aria-live="polite">
        <span className="sr-only">Semana de </span>
        {formatWeekRange(weekStart)}
        {isCurrentWeek && <span className="ml-2 align-middle text-xs font-medium text-indigo-700">(semana atual)</span>}
      </h2>
      <nav aria-label="Navegação entre semanas" className="flex gap-2">
        <button type="button" className={btn.secondary} onClick={onPrevious}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          Anterior
        </button>
        <button type="button" className={btn.secondary} onClick={onToday} disabled={isCurrentWeek}>
          <CalendarCheck className="size-4" aria-hidden="true" />
          Hoje
        </button>
        <button type="button" className={btn.secondary} onClick={onNext}>
          Próxima
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </nav>
    </div>
  )
}
