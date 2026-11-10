import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Music, PlayCircle } from 'lucide-react'
import { ErrorState } from '../../components/ui/ErrorState'
import { LoadingState } from '../../components/ui/LoadingState'
import { PageHeader } from '../../components/ui/PageHeader'
import { btn } from '../../components/ui/styles'
import { useAuth } from '../auth/auth-context'
import { formatScore } from '../lessons/lesson-model'
import { civilDateInZone, formatDate } from '../schedule/week'
import { useMusicService } from './music-context'
import { comprehensionDelta, formatDelta, MUSIC_STATUS_LABEL, type MusicStudySummary, type StudyValues } from './music-model'
import { MUSIC_MESSAGES, MusicError } from './music-service'
import { MusicStudyForm } from './MusicStudyForm'

type Result = { key: number; status: 'ready'; studies: MusicStudySummary[] } | { key: number; status: 'error' }

const num = (v: number | null) => (v === null ? null : Number(v))

function StudyCard({ s, cta }: { s: MusicStudySummary; cta?: boolean }) {
  const delta = comprehensionDelta(num(s.initial_score), num(s.final_score))
  const done = s.status === 'completed'
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="min-w-0 break-words font-semibold text-slate-900">
          <Link to={`/music/${s.id}`} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            Estudo {s.study_number ?? '—'} — <span lang="en">{s.song}</span> · {s.artist}
          </Link>
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{MUSIC_STATUS_LABEL[s.status] ?? s.status}</span>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
        <span>{s.studied_on ? formatDate(s.studied_on) : 'Sem data'}</span>
        {s.level && <span>Nível {s.level}</span>}
        <span>
          Compreensão: {formatScore(num(s.initial_score))} → {formatScore(num(s.final_score))}
          {delta !== null && ` (${formatDelta(delta)})`}
        </span>
      </p>
      {cta && (
        <Link to={`/music/${s.id}`} className={`${btn.primary} mt-3`}>
          <PlayCircle className="size-4" aria-hidden="true" />
          Continuar estudo {s.study_number ?? ''}
        </Link>
      )}
    </li>
  )
}

export function MusicPage() {
  const service = useMusicService()
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
      .then((studies) => active && setResult({ key: reloadKey, status: 'ready', studies }))
      .catch(() => active && setResult({ key: reloadKey, status: 'error' }))
    return () => {
      active = false
    }
  }, [service, reloadKey])

  const state = result && result.key === reloadKey ? result : null
  const studies = state?.status === 'ready' ? state.studies : []
  const inProgress = studies.filter((s) => s.status === 'in_progress')
  const completed = studies.filter((s) => s.status === 'completed')
  const nextNumber = studies.reduce((m, s) => Math.max(m, s.study_number ?? 0), 0) + 1

  const create = async (values: StudyValues) => {
    if (!user || busy) return
    setBusy(true)
    setError(null)
    try {
      navigate(`/music/${await service.create(user.id, values)}`)
    } catch (e) {
      setError(e instanceof MusicError ? e.userMessage : MUSIC_MESSAGES.save)
      setBusy(false)
    }
  }

  return (
    <section>
      <PageHeader title="Música" description="Estudos de inglês com músicas: atividades, palavras e evolução da compreensão." />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          {state?.status === 'ready' && `${studies.length} ${studies.length === 1 ? 'estudo' : 'estudos'} · ${completed.length} ${completed.length === 1 ? 'concluído' : 'concluídos'}`}
        </p>
        <button
          type="button"
          className={btn.primary}
          disabled={state?.status !== 'ready'}
          onClick={() => {
            setError(null)
            setCreating(true)
          }}
        >
          <Music className="size-4" aria-hidden="true" />
          Novo estudo
        </button>
      </div>

      {!state && <LoadingState label="Carregando estudos musicais…" />}
      {state?.status === 'error' && <ErrorState message={MUSIC_MESSAGES.load} onRetry={() => setReloadKey((k) => k + 1)} />}
      {state?.status === 'ready' && studies.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">Nenhum estudo musical registrado ainda. Use “Novo estudo” para começar.</p>
      )}

      {inProgress.length > 0 && (
        <section aria-labelledby="music-progress-heading" className="mb-8">
          <h2 id="music-progress-heading" className="mb-3 text-lg font-semibold text-slate-900">Em andamento</h2>
          <ul className="space-y-3">{inProgress.map((s) => <StudyCard key={s.id} s={s} cta />)}</ul>
        </section>
      )}
      {completed.length > 0 && (
        <section aria-labelledby="music-history-heading">
          <h2 id="music-history-heading" className="mb-3 text-lg font-semibold text-slate-900">Histórico (concluídos)</h2>
          <ul className="space-y-3">{completed.map((s) => <StudyCard key={s.id} s={s} />)}</ul>
        </section>
      )}

      {creating && (
        <MusicStudyForm
          editing={false}
          initial={{ studyNumber: String(nextNumber), song: '', artist: '', studiedOn: today, level: profile?.current_level ?? '', report: '' }}
          busy={busy}
          serverError={error}
          onSubmit={(v) => void create(v)}
          onClose={() => !busy && setCreating(false)}
        />
      )}
    </section>
  )
}
