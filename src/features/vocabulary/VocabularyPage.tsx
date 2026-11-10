import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookPlus, Pencil, Search, Trash2 } from 'lucide-react'
import { ErrorState } from '../../components/ui/ErrorState'
import { LoadingState } from '../../components/ui/LoadingState'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { btn, field } from '../../components/ui/styles'
import { useAuth } from '../auth/auth-context'
import { formatDateTime } from '../schedule/week'
import { useVocabularyService } from './vocabulary-context'
import { VocabularyForm } from './VocabularyForm'
import {
  FILTERS,
  inputFromRow,
  PAGE_SIZE,
  PART_OF_SPEECH,
  reviewStatus,
  type VocabularyFilter,
  type VocabularyRow,
  type VocabularyValues,
} from './vocabulary-model'
import { VOCAB_MESSAGES, VocabularyError, type SourceOption } from './vocabulary-service'

type ListResult =
  | { key: string; status: 'ready'; rows: VocabularyRow[]; total: number; loadedAt: number }
  | { key: string; status: 'error' }

type Dialog = { kind: 'create' } | { kind: 'edit'; row: VocabularyRow } | { kind: 'delete'; row: VocabularyRow } | null

const messageOf = (e: unknown) => (e instanceof VocabularyError ? e.userMessage : VOCAB_MESSAGES.save)

function StatusText({ row, now }: { row: VocabularyRow; now: number }) {
  const s = reviewStatus(row.next_review_at, new Date(now))
  if (s.kind === 'new') return <span className="text-indigo-700">Nova · sem revisão</span>
  if (s.kind === 'due') return <span className="text-amber-700">Revisão pendente</span>
  return <span className="text-slate-600">Próxima revisão: {formatDateTime(s.at)}</span>
}

function sourceLabel(row: VocabularyRow, sources: SourceOption[]): string {
  if (!row.source_type || row.source_type === 'manual' || !row.source_ref) return 'Manual'
  return sources.find((s) => s.value === `${row.source_type}:${row.source_ref}`)?.label ?? (row.source_type === 'lesson' ? 'Aula' : 'Música')
}

export function VocabularyPage() {
  const service = useVocabularyService()
  const { user } = useAuth()
  const searchId = useId()

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filter, setFilter] = useState<VocabularyFilter>('all')
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<ListResult | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const [totalWords, setTotalWords] = useState<{ key: number; value: number | null } | null>(null)
  const [sources, setSources] = useState<SourceOption[]>([])
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const key = `${filter}|${debounced}|${reloadKey}`
  useEffect(() => {
    let active = true
    service
      .list({ search: debounced, filter, limit: PAGE_SIZE, offset: 0 })
      .then((r) => active && setResult({ key, status: 'ready', ...r, loadedAt: Date.now() }))
      .catch(() => active && setResult({ key, status: 'error' }))
    return () => {
      active = false
    }
  }, [service, debounced, filter, key])

  // Contador real de palavras (independe de busca/filtro).
  useEffect(() => {
    let active = true
    service
      .summary()
      .then((s) => active && setTotalWords({ key: reloadKey, value: s.total }))
      .catch(() => active && setTotalWords({ key: reloadKey, value: null }))
    return () => {
      active = false
    }
  }, [service, reloadKey])

  useEffect(() => {
    let active = true
    service
      .sources()
      .then((s) => active && setSources(s))
      .catch(() => undefined) // sem origens disponíveis = somente "Manual"
    return () => {
      active = false
    }
  }, [service])

  const state = result && result.key === key ? result : null

  const loadMore = async () => {
    if (!state || state.status !== 'ready' || loadingMore) return
    setLoadingMore(true)
    setMoreError(false)
    try {
      const more = await service.list({ search: debounced, filter, limit: PAGE_SIZE, offset: state.rows.length })
      setResult({ ...state, rows: [...state.rows, ...more.rows], total: more.total || state.total })
    } catch {
      setMoreError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  const run = async (mutation: () => Promise<void>, success: string) => {
    if (busy) return
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      await mutation()
      setDialog(null)
      setNotice(success)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setActionError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  const open = (d: Dialog) => {
    setActionError(null)
    setNotice(null)
    setDialog(d)
  }
  const close = () => !busy && setDialog(null)

  const submit = (values: VocabularyValues) => {
    if (!dialog || !user) return
    if (dialog.kind === 'edit') void run(() => service.update(dialog.row.id, values), 'Palavra atualizada.')
    else if (dialog.kind === 'create') void run(() => service.create(user.id, values), 'Palavra adicionada.')
  }

  const total = totalWords && totalWords.key === reloadKey ? totalWords.value : undefined

  return (
    <section>
      <PageHeader title="Vocabulário" description="Palavras e expressões em inglês, com tradução e exemplos." />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700" aria-live="polite">
          {total === undefined ? 'Contando palavras…' : total === null ? 'Total indisponível' : `${total} ${total === 1 ? 'palavra cadastrada' : 'palavras cadastradas'}`}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link to="/reviews" className={btn.secondary}>
            Revisar
          </Link>
          <button type="button" className={btn.primary} onClick={() => open({ kind: 'create' })}>
            <BookPlus className="size-4" aria-hidden="true" />
            Adicionar palavra
          </button>
        </div>
      </div>

      <div className="mb-4 space-y-3">
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Buscar por palavra ou tradução
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            placeholder="Buscar por palavra ou tradução"
            className={`${field.input} pl-9`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div role="group" aria-label="Filtrar palavras" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={filter === f.value ? btn.primary : btn.secondary}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div role="status" aria-live="polite">
        {notice && !dialog && <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      </div>

      {!state && <LoadingState label="Carregando vocabulário…" />}
      {state?.status === 'error' && <ErrorState message={VOCAB_MESSAGES.load} onRetry={() => setReloadKey((k) => k + 1)} />}
      {state?.status === 'ready' && state.rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          {debounced || filter !== 'all'
            ? 'Nenhuma palavra encontrada com esta busca ou filtro.'
            : 'Nenhuma palavra cadastrada ainda. Use “Adicionar palavra” para começar.'}
        </p>
      )}
      {state?.status === 'ready' && state.rows.length > 0 && (
        <>
          <p className="mb-2 text-xs text-slate-500">
            Mostrando {state.rows.length} de {state.total}
          </p>
          <ul className="space-y-3" aria-label="Palavras">
            {state.rows.map((row) => (
              <li key={row.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h3 lang="en" className="min-w-0 break-words text-lg font-semibold text-slate-900">
                    {row.word}
                  </h3>
                  {row.part_of_speech && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {PART_OF_SPEECH.find((p) => p.value === row.part_of_speech)?.label ?? row.part_of_speech}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 break-words text-slate-700">{row.translation}</p>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <StatusText row={row} now={state.loadedAt} />
                  <span className="text-slate-500">Origem: {sourceLabel(row, sources)}</span>
                  <span className="text-slate-500">
                    {row.review_count} {row.review_count === 1 ? 'revisão' : 'revisões'}
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
                  <button type="button" className={btn.ghost} onClick={() => open({ kind: 'edit', row })} aria-label={`Editar “${row.word}”`}>
                    <Pencil className="size-4" aria-hidden="true" />
                    Editar
                  </button>
                  <button
                    type="button"
                    className={`${btn.ghost} text-red-700 hover:bg-red-50`}
                    onClick={() => open({ kind: 'delete', row })}
                    disabled={row.review_count > 0}
                    aria-label={`Excluir “${row.word}”`}
                    aria-describedby={row.review_count > 0 ? `locked-${row.id}` : undefined}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Excluir
                  </button>
                </div>
                {row.review_count > 0 && (
                  <p id={`locked-${row.id}`} className="mt-1 text-xs text-slate-500">
                    Não pode ser excluída: possui revisões registradas.
                  </p>
                )}
              </li>
            ))}
          </ul>
          {state.rows.length < state.total && (
            <div className="mt-4">
              <button type="button" className={btn.secondary} onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Carregando…' : 'Carregar mais'}
              </button>
              {moreError && <p className="mt-2 text-sm text-red-700">{VOCAB_MESSAGES.load}</p>}
            </div>
          )}
        </>
      )}

      {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
        <VocabularyForm
          initial={dialog.kind === 'edit' ? inputFromRow(dialog.row) : undefined}
          editing={dialog.kind === 'edit'}
          sources={sources}
          busy={busy}
          serverError={actionError}
          onSubmit={submit}
          onClose={close}
        />
      )}
      {dialog?.kind === 'delete' && (
        <Modal title="Excluir palavra?" description={`“${dialog.row.word}” será removida. Esta ação não pode ser desfeita.`} onClose={close} closeDisabled={busy}>
          {actionError && (
            <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {actionError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={btn.secondary} onClick={close} disabled={busy} data-autofocus>
              Cancelar
            </button>
            <button type="button" className={btn.danger} disabled={busy} onClick={() => void run(() => service.remove(dialog.row.id), 'Palavra excluída.')}>
              {busy ? 'Excluindo…' : 'Excluir'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
