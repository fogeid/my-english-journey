import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookPlus, PlayCircle } from 'lucide-react'
import { ErrorState } from '../../components/ui/ErrorState'
import { LoadingState } from '../../components/ui/LoadingState'
import { PageHeader } from '../../components/ui/PageHeader'
import { btn } from '../../components/ui/styles'
import { useAuth } from '../auth/auth-context'
import { civilDateInZone, formatDate } from '../schedule/week'
import { useLessonService } from './lesson-context'
import { LessonForm } from './LessonForm'
import { formatScore, overallScore, STATUS_LABEL, type LessonSummary, type LessonValues } from './lesson-model'
import { LESSON_MESSAGES, LessonError } from './lesson-service'

type Result = { key: number; status: 'ready'; lessons: LessonSummary[] } | { key: number; status: 'error' }

function StatusBadge({ status }: { status: string }) {
  const done = status === 'completed'
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function LessonCard({ lesson, cta }: { lesson: LessonSummary; cta?: boolean }) {
  const score = overallScore(lesson.lesson_blocks)
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="min-w-0 break-words font-semibold text-slate-900">
          <Link to={`/lessons/${lesson.id}`} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            Aula {lesson.lesson_number} — {lesson.title ?? 'Sem título'}
          </Link>
        </h3>
        <StatusBadge status={lesson.status} />
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
        <span>{lesson.studied_on ? formatDate(lesson.studied_on) : 'Sem data'}</span>
        {lesson.level && <span>Nível {lesson.level}</span>}
        <span>
          {lesson.lesson_blocks.length} {lesson.lesson_blocks.length === 1 ? 'bloco' : 'blocos'}
        </span>
        <span>Nota geral: {formatScore(score)}</span>
      </p>
      {lesson.topics.length > 0 && <p className="mt-1 break-words text-sm text-slate-500">{lesson.topics.join(' · ')}</p>}
      {cta && (
        <Link to={`/lessons/${lesson.id}`} className={`${btn.primary} mt-3`}>
          <PlayCircle className="size-4" aria-hidden="true" />
          Continuar aula {lesson.lesson_number}
        </Link>
      )}
    </li>
  )
}

export function LessonsPage() {
  const service = useLessonService()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [today] = useState(() => civilDateInZone(new Date()))

  useEffect(() => {
    let active = true
    service
      .list()
      .then((lessons) => active && setResult({ key: reloadKey, status: 'ready', lessons }))
      .catch(() => active && setResult({ key: reloadKey, status: 'error' }))
    return () => {
      active = false
    }
  }, [service, reloadKey])

  const state = result && result.key === reloadKey ? result : null
  const lessons = state?.status === 'ready' ? state.lessons : []
  const inProgress = lessons.filter((l) => l.status === 'in_progress')
  const nextNumber = lessons.reduce((m, l) => Math.max(m, l.lesson_number), 0) + 1

  const create = async (values: LessonValues) => {
    if (!user || busy) return
    setBusy(true)
    setError(null)
    try {
      const id = await service.create(user.id, values)
      navigate(`/lessons/${id}`)
    } catch (e) {
      setError(e instanceof LessonError ? e.userMessage : LESSON_MESSAGES.save)
      setBusy(false)
    }
  }

  return (
    <section>
      <PageHeader title="Aulas" description="Registro das aulas, blocos de estudo, exercícios e notas." />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          {state?.status === 'ready' &&
            `${lessons.length} ${lessons.length === 1 ? 'aula' : 'aulas'} · ${lessons.length - inProgress.length} ${lessons.length - inProgress.length === 1 ? 'concluída' : 'concluídas'}`}
        </p>
        <button type="button" className={btn.primary} onClick={() => {
            setError(null)
            setCreating(true)
          }} disabled={state?.status !== 'ready'}>
          <BookPlus className="size-4" aria-hidden="true" />
          Nova aula
        </button>
      </div>

      {!state && <LoadingState label="Carregando aulas…" />}
      {state?.status === 'error' && <ErrorState message={LESSON_MESSAGES.load} onRetry={() => setReloadKey((k) => k + 1)} />}
      {state?.status === 'ready' && lessons.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          Nenhuma aula registrada ainda. Use “Nova aula” para começar.
        </p>
      )}

      {inProgress.length > 0 && (
        <section aria-labelledby="in-progress-heading" className="mb-8">
          <h2 id="in-progress-heading" className="mb-3 text-lg font-semibold text-slate-900">
            Em andamento
          </h2>
          <ul className="space-y-3">
            {inProgress.map((l) => (
              <LessonCard key={l.id} lesson={l} cta />
            ))}
          </ul>
        </section>
      )}

      {lessons.length > 0 && (
        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="mb-3 text-lg font-semibold text-slate-900">
            Histórico
          </h2>
          <ul className="space-y-3">
            {lessons.map((l) => (
              <LessonCard key={l.id} lesson={l} />
            ))}
          </ul>
        </section>
      )}

      {creating && (
        <LessonForm
          editing={false}
          initial={{ lessonNumber: String(nextNumber), title: '', studiedOn: today, level: profile?.current_level ?? '', topics: '', report: '' }}
          busy={busy}
          serverError={error}
          onSubmit={(v) => void create(v)}
          onClose={() => !busy && setCreating(false)}
        />
      )}
    </section>
  )
}
