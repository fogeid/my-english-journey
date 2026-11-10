import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, CheckCircle2, Clock, GraduationCap, Gauge, Languages, Music, RefreshCcw, Sparkles, type LucideIcon } from 'lucide-react'
import { btn } from '../../components/ui/styles'
import { ErrorState } from '../../components/ui/ErrorState'
import { LoadingState } from '../../components/ui/LoadingState'
import { PageHeader } from '../../components/ui/PageHeader'
import { useSupabase } from '../../lib/supabase-context'
import { useAuth } from '../auth/auth-context'
import { fetchDashboardCounts, type DashboardCounts } from './dashboard-data'
import { WeeklyProgress } from './WeeklyProgress'

type CountsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; counts: DashboardCounts }

/** Resultado guardado junto com a chave da requisição que o produziu. */
type KeyedResult = { key: string } & ({ status: 'error' } | { status: 'ready'; counts: DashboardCounts })

function StatCard({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: LucideIcon; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <dt className="flex items-start gap-2 text-sm font-medium text-slate-600">
        <Icon className="mt-0.5 size-4 shrink-0 text-indigo-600" aria-hidden="true" />
        <span className="min-w-0 break-words">{label}</span>
      </dt>
      <dd className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 sm:text-3xl">{value}</dd>
      {hint && <dd className="mt-1 text-xs text-slate-500">{hint}</dd>}
    </div>
  )
}

/** Ações do dia no topo do painel: revisar a fila (se houver) ou, sem registros, os primeiros passos. */
function TodayActions({ counts }: { counts: DashboardCounts }) {
  const queue = counts.pendingReviews + counts.newWords
  if (queue > 0) {
    return (
      <Link to="/reviews" className={`${btn.primary} mb-6 w-full sm:w-auto`}>
        Revisar agora ({queue} na fila)
      </Link>
    )
  }
  if (!Object.values(counts).every((n) => n === 0)) return null
  return (
    <div className="mb-6 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
      <p>Nenhum registro ainda. Para começar, escolha por onde estudar hoje:</p>
      <nav aria-label="Primeiros passos" className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Link to="/schedule" className={btn.secondary}>Cronograma</Link>
        <Link to="/lessons" className={btn.secondary}>Registrar aula</Link>
        <Link to="/music" className={btn.secondary}>Estudo musical</Link>
        <Link to="/vocabulary" className={btn.secondary}>Adicionar palavras</Link>
      </nav>
    </div>
  )
}

export function DashboardPage() {
  const client = useSupabase()
  const { user, profile, profileStatus } = useAuth()
  const userId = user?.id ?? null
  const [result, setResult] = useState<KeyedResult | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const requestKey = userId ? `${userId}:${reloadKey}` : null

  useEffect(() => {
    if (!userId || !requestKey) return
    let active = true
    fetchDashboardCounts(client, userId)
      .then((counts) => active && setResult({ key: requestKey, status: 'ready', counts }))
      .catch(() => active && setResult({ key: requestKey, status: 'error' }))
    return () => {
      active = false
    }
  }, [client, userId, requestKey])

  // Enquanto o resultado não corresponde à requisição atual, o estado é "loading".
  const state: CountsState = result && result.key === requestKey ? result : { status: 'loading' }

  return (
    <section>
      <PageHeader title="Painel" description="Visão geral do seu estudo de inglês." />

      {state.status === 'ready' && <TodayActions counts={state.counts} />}

      <h2 className="sr-only">Perfil</h2>
      {profileStatus === 'loading' && <LoadingState label="Carregando perfil…" />}
      {profileStatus === 'ready' && profile && (
        <dl className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
          <StatCard label="Nível atual" value={profile.current_level} icon={Gauge} />
          <StatCard label="Meta diária" value={`${profile.daily_goal_minutes} min`} icon={Clock} />
        </dl>
      )}

      <WeeklyProgress />

      <h2 className="mb-3 text-lg font-semibold text-slate-900">Seus registros</h2>
      {state.status === 'loading' && <LoadingState label="Carregando contagens…" />}
      {state.status === 'error' && (
        <ErrorState message="Não foi possível carregar as contagens." onRetry={() => setReloadKey((k) => k + 1)} />
      )}
      {state.status === 'ready' && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3" aria-label="Contagens">
            <StatCard label="Aulas" value={state.counts.lessons} icon={BookOpen} />
            <StatCard label="Aulas concluídas" value={state.counts.completedLessons} icon={GraduationCap} />
            <StatCard label="Estudos musicais" value={state.counts.musicStudies} icon={Music} />
            <StatCard label="Estudos musicais concluídos" value={state.counts.completedMusic} icon={CheckCircle2} />
            <StatCard label="Vocabulário" value={state.counts.vocabulary} icon={Languages} />
            <StatCard label="Revisões pendentes" value={state.counts.pendingReviews} icon={RefreshCcw} />
            <StatCard label="Palavras novas" value={state.counts.newWords} icon={Sparkles} hint="aguardando a 1ª revisão" />
          </dl>
        </>
      )}
    </section>
  )
}
