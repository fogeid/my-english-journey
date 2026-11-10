import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BookPlus, CheckCircle2, Link2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { ErrorState } from '../../components/ui/ErrorState'
import { LoadingState } from '../../components/ui/LoadingState'
import { Modal } from '../../components/ui/Modal'
import { btn, field } from '../../components/ui/styles'
import { useAuth } from '../auth/auth-context'
import { formatScore } from '../lessons/lesson-model'
import { formatDate } from '../schedule/week'
import { VocabularyForm } from '../vocabulary/VocabularyForm'
import type { VocabularyValues } from '../vocabulary/vocabulary-model'
import { useMusicService } from './music-context'
import {
  ACTIVITY_FIELDS,
  ACTIVITY_TYPES,
  COPYRIGHT_NOTE,
  comprehensionDelta,
  formatDelta,
  MUSIC_LIMITS,
  MUSIC_STATUS_LABEL,
  validateActivity,
  validateComprehension,
  validateWord,
  type ActivityField,
  type ActivityType,
  type ActivityValues,
  type MusicActivityRow,
  type MusicStudyDetail,
  type MusicWordRow,
  type StudyValues,
  type WordErrors,
  type WordInput,
  type WordValues,
} from './music-model'
import { MUSIC_MESSAGES, MusicError } from './music-service'
import { MusicStudyForm } from './MusicStudyForm'

type Result = { key: number; status: 'ready'; study: MusicStudyDetail | null } | { key: number; status: 'error' }
type Dialog =
  | { kind: 'edit' }
  | { kind: 'delete' }
  | { kind: 'comprehension'; which: 'initial' | 'final' }
  | { kind: 'activity'; type: ActivityType; current: MusicActivityRow | undefined }
  | { kind: 'word' }
  | { kind: 'deleteWord'; word: MusicWordRow }
  | { kind: 'vocabulary'; word: MusicWordRow }
  | { kind: 'link'; word: MusicWordRow; existing: { id: string; word: string } }
  | null

const num = (v: number | null) => (v === null ? null : Number(v))

function Actions({ busy, error, label, onClose }: { busy: boolean; error: string | null; label?: string; onClose: () => void }) {
  return (
    <>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className={btn.primary} disabled={busy}>{busy ? 'Salvando…' : (label ?? 'Salvar')}</button>
      </div>
    </>
  )
}

function ComprehensionForm({ which, study, busy, serverError, onSubmit, onClose }: {
  which: 'initial' | 'final'
  study: MusicStudyDetail
  busy: boolean
  serverError: string | null
  onSubmit: (v: { score: number | null; comment: string | null }) => void
  onClose: () => void
}) {
  const base = useId()
  const score = which === 'initial' ? study.initial_score : study.final_score
  const [input, setInput] = useState({ score: score === null ? '' : String(score).replace('.', ','), comment: (which === 'initial' ? study.initial_comprehension : study.final_comprehension) ?? '' })
  const [error, setError] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const { value, error: err } = validateComprehension(input)
    setError(err)
    if (value) onSubmit(value)
  }
  return (
    <Modal title={which === 'initial' ? 'Compreensão inicial' : 'Compreensão final'} description="Quanto você entendeu da música, de 0 a 10." onClose={onClose} closeDisabled={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor={`${base}-s`} className={field.label}>Nota (0 a 10) <span className="font-normal text-slate-500">(vazio = sem avaliação)</span></label>
          <input id={`${base}-s`} data-autofocus inputMode="decimal" className={field.input} value={input.score} onChange={(e) => setInput((p) => ({ ...p, score: e.target.value }))} aria-invalid={!!error} aria-describedby={error ? `${base}-e` : undefined} />
          {error && <p id={`${base}-e`} className={field.error}>{error}</p>}
        </div>
        <div>
          <label htmlFor={`${base}-c`} className={field.label}>Comentário <span className="font-normal text-slate-500">(opcional)</span></label>
          <textarea id={`${base}-c`} rows={3} className={field.input} value={input.comment} onChange={(e) => setInput((p) => ({ ...p, comment: e.target.value }))} />
        </div>
        <Actions busy={busy} error={serverError} onClose={onClose} />
      </form>
    </Modal>
  )
}

function ActivityForm({ type, current, busy, serverError, onSubmit, onClose }: {
  type: ActivityType
  current: MusicActivityRow | undefined
  busy: boolean
  serverError: string | null
  onSubmit: (v: ActivityValues) => void
  onClose: () => void
}) {
  const base = useId()
  const [input, setInput] = useState<Record<ActivityField, string>>(() =>
    Object.fromEntries(ACTIVITY_FIELDS.map(({ key }) => [key, current?.[key] ?? ''])) as Record<ActivityField, string>,
  )
  const [error, setError] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const { values, error: err } = validateActivity(input)
    setError(err)
    if (values) onSubmit(values)
  }
  return (
    <Modal title={ACTIVITY_TYPES.find((a) => a.value === type)!.label} description={COPYRIGHT_NOTE} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {ACTIVITY_FIELDS.map(({ key, label }, i) => (
          <div key={key}>
            <label htmlFor={`${base}-${key}`} className={field.label}>{label}</label>
            <textarea
              id={`${base}-${key}`}
              rows={2}
              data-autofocus={i === 0 ? true : undefined}
              maxLength={MUSIC_LIMITS.activityField + 100}
              className={field.input}
              value={input[key]}
              onChange={(e) => setInput((p) => ({ ...p, [key]: e.target.value }))}
            />
          </div>
        ))}
        {error && <p className={field.error}>{error}</p>}
        <Actions busy={busy} error={serverError} onClose={onClose} />
      </form>
    </Modal>
  )
}

function WordForm({ busy, serverError, onSubmit, onClose }: { busy: boolean; serverError: string | null; onSubmit: (v: WordValues) => void; onClose: () => void }) {
  const base = useId()
  const [input, setInput] = useState<WordInput>({ term: '', meaning: '', excerpt: '' })
  const [errors, setErrors] = useState<WordErrors>({})
  const fields: { key: keyof WordInput; label: string; optional?: boolean }[] = [
    { key: 'term', label: 'Palavra ou expressão (inglês)' },
    { key: 'meaning', label: 'Significado', optional: true },
    { key: 'excerpt', label: `Trecho curto onde aparece (até ${MUSIC_LIMITS.excerpt} caracteres)`, optional: true },
  ]
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const { values, errors: errs } = validateWord(input)
    setErrors(errs)
    if (values) onSubmit(values)
  }
  return (
    <Modal title="Palavra ou expressão do estudo" onClose={onClose} closeDisabled={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {fields.map(({ key, label, optional }, i) => (
          <div key={key}>
            <label htmlFor={`${base}-${key}`} className={field.label}>
              {label} {optional && <span className="font-normal text-slate-500">(opcional)</span>}
            </label>
            <input
              id={`${base}-${key}`}
              data-autofocus={i === 0 ? true : undefined}
              lang={key === 'meaning' ? undefined : 'en'}
              className={field.input}
              value={input[key]}
              onChange={(e) => setInput((p) => ({ ...p, [key]: e.target.value }))}
              aria-invalid={!!errors[key]}
              aria-describedby={errors[key] ? `${base}-${key}-e` : undefined}
            />
            {errors[key] && <p id={`${base}-${key}-e`} className={field.error}>{errors[key]}</p>}
          </div>
        ))}
        <Actions busy={busy} error={serverError} onClose={onClose} />
      </form>
    </Modal>
  )
}

function Text({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-800">{value || <span className="text-slate-400">—</span>}</dd>
    </div>
  )
}

export function MusicDetailPage() {
  const { studyId = '' } = useParams()
  const service = useMusicService()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    service
      .get(studyId)
      .then((study) => active && setResult({ key: reloadKey, status: 'ready', study }))
      .catch(() => active && setResult({ key: reloadKey, status: 'error' }))
    return () => {
      active = false
    }
  }, [service, studyId, reloadKey])

  const run = async (mutation: () => Promise<void>, success: string, after?: () => void) => {
    if (busy) return
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      await mutation()
      setDialog(null)
      setNotice(success)
      if (after) after()
      else setReloadKey((k) => k + 1)
    } catch (e) {
      setActionError(e instanceof MusicError ? e.userMessage : MUSIC_MESSAGES.save)
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

  /** Opção explícita: verifica duplicata no vocabulário antes de criar; se já existe, oferece vincular. */
  const startAddToVocabulary = async (word: MusicWordRow) => {
    if (busy) return
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      const existing = await service.findVocabulary(word.term)
      setDialog(existing ? { kind: 'link', word, existing } : { kind: 'vocabulary', word })
    } catch (e) {
      setActionError(e instanceof MusicError ? e.userMessage : MUSIC_MESSAGES.load)
    } finally {
      setBusy(false)
    }
  }

  const state = result && result.key === reloadKey ? result : null
  if (!state) return <LoadingState label="Carregando estudo…" />
  if (state.status === 'error') return <ErrorState message={MUSIC_MESSAGES.loadOne} onRetry={() => setReloadKey((k) => k + 1)} />
  const study = state.study
  if (!study) {
    return (
      <section>
        <p className="mb-4 rounded-lg border border-dashed border-slate-300 bg-white p-5 text-slate-700">{MUSIC_MESSAGES.notFound}</p>
        <Link to="/music" className={btn.secondary}>Voltar aos estudos musicais</Link>
      </section>
    )
  }

  const completed = study.status === 'completed'
  const delta = comprehensionDelta(num(study.initial_score), num(study.final_score))
  const sourceOption = { value: `music:${study.id}`, label: `Música: ${study.song} — ${study.artist}` }

  return (
    <section>
      <Link to="/music" className={`${btn.ghost} -ml-2 mb-3`}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        Estudos musicais
      </Link>
      <header className="mb-4">
        <h1 className="break-words text-2xl font-semibold tracking-tight text-slate-900">
          Estudo {study.study_number ?? '—'} — <span lang="en">{study.song}</span>
        </h1>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
          <span>{study.artist}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${completed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{MUSIC_STATUS_LABEL[study.status]}</span>
          <span>{study.studied_on ? formatDate(study.studied_on) : 'Sem data'}</span>
          {study.level && <span>Nível {study.level}</span>}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className={btn.secondary} onClick={() => open({ kind: 'edit' })}>
          <Pencil className="size-4" aria-hidden="true" />
          Editar dados
        </button>
        {completed ? (
          <button type="button" className={btn.secondary} disabled={busy} onClick={() => void run(() => service.setStatus(study.id, 'in_progress'), 'Estudo reaberto.')}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Reabrir estudo
          </button>
        ) : (
          <button type="button" className={btn.primary} disabled={busy} onClick={() => void run(() => service.setStatus(study.id, 'completed'), 'Estudo concluído.')}>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Marcar como concluído
          </button>
        )}
        <button type="button" className={`${btn.secondary} text-red-700`} onClick={() => open({ kind: 'delete' })}>
          <Trash2 className="size-4" aria-hidden="true" />
          Excluir estudo
        </button>
      </div>

      <div role="status" aria-live="polite">
        {notice && !dialog && <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      </div>
      {actionError && !dialog && <div className="mb-4"><ErrorState message={actionError} /></div>}

      <p className="mb-6 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">{COPYRIGHT_NOTE}</p>

      <section aria-labelledby="comp-heading" className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 id="comp-heading" className="mb-3 text-lg font-semibold text-slate-900">Compreensão (0 a 10)</h2>
        <dl className="grid grid-cols-3 gap-3 text-center">
          {(['initial', 'final'] as const).map((w) => (
            <div key={w} className="min-w-0 rounded-md bg-slate-50 p-3">
              <dt className="text-xs font-medium text-slate-600">{w === 'initial' ? 'Inicial' : 'Final'}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{formatScore(num(w === 'initial' ? study.initial_score : study.final_score))}</dd>
              <dd>
                <button type="button" className={`${btn.ghost} mt-1`} onClick={() => open({ kind: 'comprehension', which: w })} aria-label={`Registrar compreensão ${w === 'initial' ? 'inicial' : 'final'}`}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Registrar
                </button>
              </dd>
            </div>
          ))}
          <div className="min-w-0 rounded-md bg-slate-50 p-3">
            <dt className="text-xs font-medium text-slate-600">Diferença</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900" aria-label={`Diferença: ${formatDelta(delta)}`}>{formatDelta(delta)}</dd>
            <dd className="mt-1 text-xs text-slate-500">{delta === null ? 'registre as duas' : 'final − inicial'}</dd>
          </div>
        </dl>
        {(study.initial_comprehension || study.final_comprehension) && (
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Text label="Comentário inicial" value={study.initial_comprehension} />
            <Text label="Comentário final" value={study.final_comprehension} />
          </dl>
        )}
      </section>

      <section aria-labelledby="act-heading" className="mb-6">
        <h2 id="act-heading" className="mb-3 text-lg font-semibold text-slate-900">Atividades</h2>
        <ol className="space-y-3">
          {ACTIVITY_TYPES.map(({ value, label }, i) => {
            const a = study.music_activities.find((x) => x.activity_type === value)
            return (
              <li key={value} aria-label={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{i + 1}. {label}</h3>
                  <button type="button" className={btn.ghost} onClick={() => open({ kind: 'activity', type: value, current: a })} aria-label={`${a ? 'Editar' : 'Registrar'} atividade: ${label}`}>
                    <Pencil className="size-4" aria-hidden="true" />
                    {a ? 'Editar' : 'Registrar'}
                  </button>
                </div>
                {a ? (
                  <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {ACTIVITY_FIELDS.map((f) => <Text key={f.key} label={f.label} value={a[f.key]} />)}
                  </dl>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Ainda não registrada.</p>
                )}
              </li>
            )
          })}
        </ol>
      </section>

      <section aria-labelledby="words-heading" className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="words-heading" className="text-lg font-semibold text-slate-900">Palavras e expressões aprendidas</h2>
          <button type="button" className={btn.primary} onClick={() => open({ kind: 'word' })}>
            <Plus className="size-4" aria-hidden="true" />
            Adicionar palavra
          </button>
        </div>
        {study.music_words.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">Nenhuma palavra registrada neste estudo.</p>
        ) : (
          <ul className="space-y-2" aria-label="Palavras do estudo">
            {study.music_words.map((w) => (
              <li key={w.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="break-words">
                  <strong lang="en" className="text-slate-900">{w.term}</strong>
                  {w.meaning && <span className="text-slate-700"> — {w.meaning}</span>}
                </p>
                {w.excerpt && <p lang="en" className="mt-1 break-words text-sm italic text-slate-600">“{w.excerpt}”</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2">
                  {w.vocabulary_id ? (
                    <Link to="/vocabulary" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      No vocabulário
                    </Link>
                  ) : (
                    <button type="button" className={btn.ghost} disabled={busy} onClick={() => void startAddToVocabulary(w)} aria-label={`Adicionar “${w.term}” ao vocabulário`}>
                      <BookPlus className="size-4" aria-hidden="true" />
                      Adicionar ao vocabulário
                    </button>
                  )}
                  <button type="button" className={`${btn.ghost} text-red-700 hover:bg-red-50`} onClick={() => open({ kind: 'deleteWord', word: w })} aria-label={`Excluir “${w.term}” deste estudo`}>
                    <Trash2 className="size-4" aria-hidden="true" />
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {study.report && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <dl><Text label="Observações gerais" value={study.report} /></dl>
        </section>
      )}

      {/* ---------- diálogos ---------- */}
      {dialog?.kind === 'edit' && (
        <MusicStudyForm
          editing
          initial={{ studyNumber: String(study.study_number ?? ''), song: study.song, artist: study.artist, studiedOn: study.studied_on ?? '', level: study.level ?? '', report: study.report ?? '' }}
          busy={busy}
          serverError={actionError}
          onSubmit={(v: StudyValues) => void run(() => service.update(study.id, v), 'Estudo atualizado.')}
          onClose={close}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="Excluir estudo musical?"
          description={`O estudo ${study.study_number ?? ''} (“${study.song}”), suas atividades e ${study.music_words.length} palavras do estudo serão excluídos. Palavras já adicionadas ao vocabulário continuam lá. Esta ação não pode ser desfeita.`}
          busy={busy}
          error={actionError}
          onConfirm={() => void run(() => service.remove(study.id), 'Estudo excluído.', () => navigate('/music'))}
          onClose={close}
        />
      )}
      {dialog?.kind === 'comprehension' && (
        <ComprehensionForm which={dialog.which} study={study} busy={busy} serverError={actionError} onSubmit={(v) => void run(() => service.setComprehension(study.id, dialog.which, v), 'Compreensão registrada.')} onClose={close} />
      )}
      {dialog?.kind === 'activity' && user && (
        <ActivityForm type={dialog.type} current={dialog.current} busy={busy} serverError={actionError} onSubmit={(v) => void run(() => service.saveActivity(user.id, study.id, dialog.type, v), 'Atividade salva.')} onClose={close} />
      )}
      {dialog?.kind === 'word' && user && (
        <WordForm busy={busy} serverError={actionError} onSubmit={(v) => void run(() => service.addWord(user.id, study.id, v), 'Palavra registrada no estudo.')} onClose={close} />
      )}
      {dialog?.kind === 'deleteWord' && (
        <ConfirmDialog
          title="Excluir palavra do estudo?"
          description={`“${dialog.word.term}” sai deste estudo.${dialog.word.vocabulary_id ? ' A palavra continua no seu vocabulário.' : ''}`}
          busy={busy}
          error={actionError}
          onConfirm={() => void run(() => service.removeWord(dialog.word.id), 'Palavra excluída do estudo.')}
          onClose={close}
        />
      )}
      {dialog?.kind === 'vocabulary' && user && (
        <VocabularyForm
          editing={false}
          initial={{ word: dialog.word.term, translation: dialog.word.meaning ?? '', example1: dialog.word.excerpt ?? '', example2: '', partOfSpeech: '', notes: '', source: sourceOption.value }}
          sources={[sourceOption]}
          busy={busy}
          serverError={actionError}
          onSubmit={(v: VocabularyValues) => void run(() => service.addToVocabulary(user.id, dialog.word.id, v), `“${v.word}” adicionada ao vocabulário.`)}
          onClose={close}
        />
      )}
      {dialog?.kind === 'link' && (
        <Modal title="Palavra já está no vocabulário" description={`“${dialog.existing.word}” já existe no seu vocabulário. Nada será duplicado.`} onClose={close} closeDisabled={busy}>
          {actionError && <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{actionError}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={btn.secondary} onClick={close} disabled={busy} data-autofocus>Cancelar</button>
            <button type="button" className={btn.primary} disabled={busy} onClick={() => void run(() => service.linkWord(dialog.word.id, dialog.existing.id), 'Palavra vinculada ao vocabulário existente.')}>
              <Link2 className="size-4" aria-hidden="true" />
              Vincular à existente
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
