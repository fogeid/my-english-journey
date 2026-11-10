import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ErrorState } from '../../components/ui/ErrorState'
import { LoadingState } from '../../components/ui/LoadingState'
import { PageHeader } from '../../components/ui/PageHeader'
import { btn, field } from '../../components/ui/styles'
import { useAuth } from '../auth/auth-context'
import { LEVELS } from '../lessons/lesson-model'
import { civilDateInZone, formatDate } from '../schedule/week'
import { useSupabase } from '../../lib/supabase-context'
import { ScoreLineChart, SkillBars, WeeklyBars } from './charts'
import { useProgressService } from './progress-context'
import { computeProgress, formatMinutes, periodRange, PERIODS, startOfCivilDayUtc, type Period, type RawProgressData } from './progress-model'
import { PROGRESS_MESSAGES } from './progress-service'

type Result = { key: string; status: 'ready'; raw: RawProgressData } | { key: string; status: 'error' }

function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <dt className="truncate text-sm font-medium text-slate-600">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</dd>
      {hint && <dd className="mt-1 text-xs text-slate-500">{hint}</dd>}
    </div>
  )
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 id={id} className="text-lg font-semibold text-slate-900">
        {title}
      </h2>
      {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">{children}</p>
)

/** Nível A1–C2: sempre informado pelo usuário (o app nunca o infere a partir das notas). */
function LevelControl() {
  const client = useSupabase()
  const { user, profile, reloadProfile } = useAuth()
  const id = useId()
  const [value, setValue] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = value ?? profile?.current_level ?? ''
  const changed = !!profile && current !== profile.current_level

  const save = async () => {
    if (!user || !changed || saving) return
    setSaving(true)
    setError(null)
    const { data, error: e } = await client.from('profiles').update({ current_level: current }).eq('user_id', user.id).select('user_id')
    setSaving(false)
    if (e || !data || data.length !== 1) setError('Não foi possível salvar o nível.')
    else {
      setValue(null)
      reloadProfile()
    }
  }

  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <label htmlFor={id} className="block truncate text-sm font-medium text-slate-600">
        Nível (informado por você)
      </label>
      <div className="mt-1 flex items-center gap-2">
        <select id={id} className={`${field.input} w-24 text-lg font-semibold`} value={current} onChange={(e) => setValue(e.target.value)} disabled={!profile}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        {changed && (
          <button type="button" className={btn.primary} onClick={() => void save()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">{error ?? 'O app não altera o nível a partir das notas.'}</p>
    </div>
  )
}

export function ProgressPage() {
  const service = useProgressService()
  const [params, setParams] = useSearchParams()
  const period = (PERIODS.some((p) => p.value === params.get('period')) ? params.get('period') : '30d') as Period
  const [today] = useState(() => civilDateInZone(new Date()))
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<Result | null>(null)

  const range = periodRange(period, today)
  // Filtro no servidor com 1 dia de folga; o recorte exato por dia civil (America/Cuiaba) é feito no cálculo.
  const fromInstant = range.from ? new Date(startOfCivilDayUtc(range.from).getTime() - 86_400_000) : null
  const key = `${period}|${reloadKey}`
  const fromMs = fromInstant?.getTime() ?? null

  useEffect(() => {
    let active = true
    service
      .load(fromMs === null ? null : new Date(fromMs))
      .then((raw) => active && setResult({ key, status: 'ready', raw }))
      .catch(() => active && setResult({ key, status: 'error' }))
    return () => {
      active = false
    }
  }, [service, fromMs, key])

  const state = result && result.key === key ? result : null
  const p = state?.status === 'ready' ? computeProgress(state.raw, period, today) : null
  const rangeLabel = !p ? '' : p.firstDay ? `${formatDate(p.firstDay)} – ${formatDate(p.range.to)}` : 'nenhum registro ainda'
  const hasAnyScore = p ? p.skills.some((s) => s.average !== null) : false

  return (
    <section>
      <PageHeader title="Progresso" description="Sua evolução a partir dos dados registrados — nada é estimado ou inventado." />

      <div role="group" aria-label="Período" className="mb-2 flex flex-wrap gap-2">
        {PERIODS.map((x) => (
          <button
            key={x.value}
            type="button"
            aria-pressed={period === x.value}
            className={period === x.value ? btn.primary : btn.secondary}
            onClick={() => setParams(x.value === '30d' ? {} : { period: x.value })}
          >
            {x.label}
          </button>
        ))}
      </div>
      <p className="mb-6 text-sm text-slate-600" aria-live="polite">
        {p && `Período: ${rangeLabel} (fuso America/Cuiaba).`}
      </p>

      {!state && <LoadingState label="Calculando progresso…" />}
      {state?.status === 'error' && <ErrorState message={PROGRESS_MESSAGES.load} onRetry={() => setReloadKey((k) => k + 1)} />}

      {p && (
        <div className="space-y-6">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Resumo do período">
            <LevelControl />
            <Tile label="Aulas concluídas" value={p.completedLessons} hint="pela data da aula" />
            <Tile label="Horas estudadas" value={formatMinutes(p.minutesStudied)} hint={`${p.completedSessions} ${p.completedSessions === 1 ? 'atividade concluída' : 'atividades concluídas'} (minutos registrados)`} />
            <Tile label="Palavras cadastradas" value={p.wordsTotal} hint={`${p.wordsAdded} ${p.wordsAdded === 1 ? 'nova' : 'novas'} no período`} />
            <Tile label="Revisões de vocabulário" value={p.reviewsDone} hint="realizadas no período" />
            <Tile
              label="Frequência"
              value={p.avgDaysPerWeek === null ? '—' : `${p.avgDaysPerWeek.toLocaleString('pt-BR')} dias/sem.`}
              hint={p.periodDays ? `${p.studyDays} ${p.studyDays === 1 ? 'dia' : 'dias'} com estudo em ${p.periodDays}` : 'sem registros ainda'}
            />
          </dl>

          <Panel title="Planejado × realizado" description="Atividades do cronograma com dia planejado neste período.">
            {p.planned.activities === 0 ? (
              <Empty>
                Nenhuma atividade planejada neste período. <Link to="/schedule" className="text-indigo-700 underline">Abrir o cronograma</Link>
              </Empty>
            ) : (
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Tile label="Planejadas" value={p.planned.activities} hint={`${formatMinutes(p.planned.minutes)} previstos`} />
                <Tile label="Realizadas" value={p.realized.activities} hint={`${formatMinutes(p.realized.minutes)} registrados`} />
                <Tile label="Taxa de realização" value={`${Math.round((p.realized.activities / p.planned.activities) * 100)}%`} hint="realizadas ÷ planejadas" />
              </dl>
            )}
          </Panel>

          <Panel title="Evolução das notas" description="Nota geral de cada aula concluída (média dos blocos avaliados, 0–10), em ordem de data.">
            {p.scoreSeries.length === 0 ? (
              <Empty>Nenhuma aula concluída com notas neste período. As notas são registradas nos blocos de cada aula.</Empty>
            ) : (
              <ScoreLineChart points={p.scoreSeries} />
            )}
            {p.completedWithoutScore > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {p.completedWithoutScore} {p.completedWithoutScore === 1 ? 'aula concluída sem notas não aparece' : 'aulas concluídas sem notas não aparecem'} no gráfico.
              </p>
            )}
          </Panel>

          <Panel title="Desempenho por habilidade" description="Média simples das notas dos blocos das aulas concluídas. Blocos sem nota e o bloco de revisão não entram. Entre parênteses, o número de blocos.">
            {hasAnyScore ? <SkillBars skills={p.skills} /> : <Empty>Ainda não há blocos com nota em aulas concluídas neste período.</Empty>}
          </Panel>

          <Panel title="Frequência semanal" description="Dias com estudo por semana: atividade concluída, aula registrada, revisão de vocabulário ou estudo musical concluído. Cada dia conta uma vez.">
            {p.studyDays === 0 ? <Empty>Nenhum dia com estudo registrado neste período.</Empty> : <WeeklyBars weeks={p.weeks} />}
          </Panel>

          <Panel title="Dificuldades e recomendações" description="Registradas nas aulas do período, da mais recente para a mais antiga.">
            {p.notes.length === 0 ? (
              <Empty>Nenhuma dificuldade ou recomendação registrada nas aulas deste período.</Empty>
            ) : (
              <ul className="space-y-3">
                {p.notes.map((n) => (
                  <li key={n.lessonId} className="rounded-lg border border-slate-200 p-3">
                    <Link to={`/lessons/${n.lessonId}`} className="font-medium text-indigo-700 hover:underline">
                      Aula {n.lessonNumber}
                      {n.title ? ` — ${n.title}` : ''}
                    </Link>
                    <span className="ml-2 text-xs text-slate-500">{n.date ? formatDate(n.date) : 'sem data'}</span>
                    <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Dificuldades</dt>
                        <dd className="whitespace-pre-line break-words text-slate-800">{n.difficulties ?? '—'}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Recomendações</dt>
                        <dd className="whitespace-pre-line break-words text-slate-800">{n.recommendations ?? '—'}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </section>
  )
}
