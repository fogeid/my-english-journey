import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Eye } from 'lucide-react'
import { ErrorState } from '../../components/ui/ErrorState'
import { LoadingState } from '../../components/ui/LoadingState'
import { PageHeader } from '../../components/ui/PageHeader'
import { btn } from '../../components/ui/styles'
import { formatDateTime } from '../schedule/week'
import { useVocabularyService } from '../vocabulary/vocabulary-context'
import type { QueueCard, Rating, VocabularySummary } from '../vocabulary/vocabulary-model'
import { VOCAB_MESSAGES, VocabularyError } from '../vocabulary/vocabulary-service'
import { formatInterval, previewIntervalMinutes, RATINGS } from './review-schedule'

type QueueResult = { key: number; status: 'ready'; cards: QueueCard[] } | { key: number; status: 'error' }

const newRequestId = () => crypto.randomUUID()

export function ReviewsPage() {
  const service = useVocabularyService()
  const [queueKey, setQueueKey] = useState(0)
  const [queue, setQueue] = useState<QueueResult | null>(null)
  const [answered, setAnswered] = useState<{ key: number; ids: string[] }>({ key: 0, ids: [] })
  const [summary, setSummary] = useState<{ key: number; value: VocabularySummary | null } | null>(null)
  const [summaryKey, setSummaryKey] = useState(0)
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState<{ cardId: string; rating: Rating; requestId: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionCount, setSessionCount] = useState(0)
  const [last, setLast] = useState<{ word: string; next: string | null; minutes: number | null } | null>(null)
  const revealRef = useRef<HTMLButtonElement>(null)
  const answerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    service
      .queue(20)
      .then((cards) => active && setQueue({ key: queueKey, status: 'ready', cards }))
      .catch(() => active && setQueue({ key: queueKey, status: 'error' }))
    return () => {
      active = false
    }
  }, [service, queueKey])

  useEffect(() => {
    let active = true
    service
      .summary()
      .then((s) => active && setSummary({ key: summaryKey, value: s }))
      .catch(() => active && setSummary({ key: summaryKey, value: null }))
    return () => {
      active = false
    }
  }, [service, summaryKey])

  const loaded = queue && queue.key === queueKey ? queue : null
  const answeredIds = answered.key === queueKey ? answered.ids : []
  const remaining = loaded?.status === 'ready' ? loaded.cards.filter((c) => !answeredIds.includes(c.id)) : []
  const current = remaining[0] ?? null
  const revealed = !!current && revealedId === current.id

  // Foco: novo cartão → botão "Mostrar resposta".
  const currentId = current?.id
  useEffect(() => {
    if (currentId) revealRef.current?.focus()
  }, [currentId])

  const reveal = () => {
    if (!current) return
    setRevealedId(current.id)
    setTimeout(() => answerRef.current?.focus(), 0)
  }

  const rate = useCallback(
    async (rating: Rating) => {
      if (!current || !revealed || submitting) return
      // Retry da mesma resposta reaproveita o request_id (idempotente no servidor).
      const requestId = attempt && attempt.cardId === current.id && attempt.rating === rating ? attempt.requestId : newRequestId()
      setAttempt({ cardId: current.id, rating, requestId })
      setSubmitting(true)
      setError(null)
      try {
        const result = await service.review(current.id, rating, requestId)
        setAnswered((prev) => ({ key: queueKey, ids: [...(prev.key === queueKey ? prev.ids : []), current.id] }))
        setSessionCount((n) => n + 1)
        setLast({ word: current.word, next: result.next_review_at, minutes: result.interval_minutes })
        setAttempt(null)
        setRevealedId(null)
        setSummaryKey((k) => k + 1)
        // Último cartão da fila local: busca no servidor se há mais itens vencidos/novos.
        if (remaining.length === 1) setQueueKey((k) => k + 1)
      } catch (e) {
        // Falha: o cartão NÃO avança e nada é mostrado como salvo.
        setError(e instanceof VocabularyError ? e.userMessage : VOCAB_MESSAGES.review)
      } finally {
        setSubmitting(false)
      }
    },
    [attempt, current, queueKey, remaining.length, revealed, service, submitting],
  )

  // Atalhos 1–4 somente depois de revelar a resposta.
  useEffect(() => {
    if (!revealed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const r = RATINGS.find((x) => x.key === e.key)
      if (r) {
        e.preventDefault()
        void rate(r.value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, rate])

  const s = summary && summary.key === summaryKey ? summary.value : undefined

  return (
    <section>
      <PageHeader title="Revisões" description="Flashcards do seu vocabulário com repetição espaçada." />

      <dl className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm" aria-label="Resumo das revisões">
        <div className="flex gap-1">
          <dt className="text-slate-600">Vencidas:</dt>
          <dd className="font-semibold tabular-nums">{s === undefined ? '…' : s === null ? '—' : s.due}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-600">Novas:</dt>
          <dd className="font-semibold tabular-nums">{s === undefined ? '…' : s === null ? '—' : s.new_words}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-600">Respondidas nesta sessão:</dt>
          <dd className="font-semibold tabular-nums">{sessionCount}</dd>
        </div>
      </dl>

      <div role="status" aria-live="polite">
        {last && (
          <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            “{last.word}” salva.
            {last.next && last.minutes !== null && ` Próxima revisão em ${formatInterval(last.minutes)} (${formatDateTime(last.next)}).`}
          </p>
        )}
      </div>

      {!loaded && <LoadingState label="Carregando fila de revisões…" />}
      {loaded?.status === 'error' && <ErrorState message={VOCAB_MESSAGES.queue} onRetry={() => setQueueKey((k) => k + 1)} />}

      {loaded?.status === 'ready' && !current && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <CheckCircle2 className="mx-auto size-8 text-emerald-600" aria-hidden="true" />
          <p className="mt-2 font-medium text-slate-900">
            {sessionCount > 0 ? `Sessão concluída: ${sessionCount} ${sessionCount === 1 ? 'palavra revisada' : 'palavras revisadas'}.` : 'Nenhuma revisão pendente agora.'}
          </p>
          <p className="mt-1 text-sm text-slate-600">Novas palavras e revisões vencidas aparecerão aqui.</p>
          <Link to="/vocabulary" className={`${btn.secondary} mt-4`}>
            Voltar ao vocabulário
          </Link>
        </div>
      )}

      {current && (
        <article aria-labelledby="flashcard-term" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {current.next_review_at ? 'Revisão' : 'Palavra nova'} · {remaining.length} na fila
          </p>
          <h2 id="flashcard-term" lang="en" className="mt-2 break-words text-3xl font-semibold text-slate-900">
            {current.word}
          </h2>

          {!revealed ? (
            <button ref={revealRef} type="button" className={`${btn.primary} mt-6 w-full sm:w-auto`} onClick={reveal}>
              <Eye className="size-4" aria-hidden="true" />
              Mostrar resposta
            </button>
          ) : (
            <>
              <div ref={answerRef} tabIndex={-1} aria-label="Resposta" className="mt-5 space-y-3 border-t border-slate-100 pt-4 focus:outline-none">
                <p className="text-xl text-slate-800">{current.translation}</p>
                {(current.example_1 || current.example_2) && (
                  <ul className="space-y-1 text-slate-700" aria-label="Exemplos">
                    {current.example_1 && <li lang="en" className="break-words">• {current.example_1}</li>}
                    {current.example_2 && <li lang="en" className="break-words">• {current.example_2}</li>}
                  </ul>
                )}
              </div>

              {error && (
                <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              )}

              <div role="group" aria-label="Como foi?" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {RATINGS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={r.value === 'again' ? btn.secondary : r.value === 'good' ? btn.primary : btn.secondary}
                    disabled={submitting}
                    onClick={() => void rate(r.value)}
                    aria-keyshortcuts={r.key}
                  >
                    <span className="flex flex-col items-center leading-tight">
                      <span>{r.label}</span>
                      <span className="text-xs font-normal opacity-80">{formatInterval(previewIntervalMinutes(current.review_streak, r.value))}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {submitting ? 'Salvando…' : 'Atalhos: 1 Errei · 2 Difícil · 3 Bom · 4 Fácil.'} Intervalos são uma regra simples, não uma recomendação pedagógica.
              </p>
            </>
          )}
        </article>
      )}
    </section>
  )
}
