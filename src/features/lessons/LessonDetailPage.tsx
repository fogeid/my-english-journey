import { useEffect, useId, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { ErrorState } from '../../components/ui/ErrorState'
import { LoadingState } from '../../components/ui/LoadingState'
import { Modal } from '../../components/ui/Modal'
import { btn, field } from '../../components/ui/styles'
import { useAuth } from '../auth/auth-context'
import { formatDate } from '../schedule/week'
import { ExerciseForm } from './ExerciseForm'
import { useLessonService } from './lesson-context'
import { LessonForm } from './LessonForm'
import {
  BLOCK_TYPES,
  blockLabel,
  formatScore,
  LIMITS,
  overallScore,
  parseScore,
  sortBlocks,
  STATUS_LABEL,
  type BlockType,
  type BlockWithExercises,
  type ExerciseRow,
  type ExerciseValues,
  type LessonDetail,
  type LessonValues,
} from './lesson-model'
import { LESSON_MESSAGES, LessonError } from './lesson-service'

type Result = { key: number; status: 'ready'; lesson: LessonDetail | null } | { key: number; status: 'error' }

type Dialog =
  | { kind: 'editLesson' }
  | { kind: 'deleteLesson' }
  | { kind: 'notes' }
  | { kind: 'block'; block: BlockWithExercises }
  | { kind: 'deleteBlock'; block: BlockWithExercises }
  | { kind: 'addExercise'; block: BlockWithExercises }
  | { kind: 'editExercise'; block: BlockWithExercises; exercise: ExerciseRow }
  | { kind: 'deleteExercise'; exercise: ExerciseRow }
  | null

// ---------- formulários pequenos ----------
function BlockForm({ block, busy, serverError, onSubmit, onClose }: {
  block: BlockWithExercises
  busy: boolean
  serverError: string | null
  onSubmit: (v: { score: number | null; notes: string | null }) => void
  onClose: () => void
}) {
  const base = useId()
  const [score, setScore] = useState(block.score === null ? '' : String(block.score).replace('.', ','))
  const [notes, setNotes] = useState(block.notes ?? '')
  const [error, setError] = useState<{ score?: string; notes?: string }>({})
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const s = parseScore(score)
    const errs: { score?: string; notes?: string } = {}
    if (s === undefined) errs.score = 'Use um número de 0 a 10, com até 1 casa decimal (ex.: 8,5).'
    if (notes.trim().length > LIMITS.blockNotes) errs.notes = `Use no máximo ${LIMITS.blockNotes} caracteres.`
    setError(errs)
    if (Object.keys(errs).length === 0) onSubmit({ score: s ?? null, notes: notes.trim() || null })
  }
  return (
    <Modal title={`Bloco: ${blockLabel(block.block_type)}`} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor={`${base}-score`} className={field.label}>
            Nota do bloco (0 a 10) <span className="font-normal text-slate-500">(deixe vazio se não avaliado)</span>
          </label>
          <input id={`${base}-score`} data-autofocus inputMode="decimal" className={field.input} value={score} onChange={(e) => setScore(e.target.value)} aria-invalid={!!error.score} aria-describedby={error.score ? `${base}-score-error` : undefined} />
          {error.score && <p id={`${base}-score-error`} className={field.error}>{error.score}</p>}
        </div>
        <div>
          <label htmlFor={`${base}-notes`} className={field.label}>
            Observações do bloco <span className="font-normal text-slate-500">(opcional)</span>
          </label>
          <textarea id={`${base}-notes`} rows={3} className={field.input} value={notes} onChange={(e) => setNotes(e.target.value)} aria-invalid={!!error.notes} aria-describedby={error.notes ? `${base}-notes-error` : undefined} />
          {error.notes && <p id={`${base}-notes-error`} className={field.error}>{error.notes}</p>}
        </div>
        {serverError && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{serverError}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className={btn.primary} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function NotesForm({ lesson, busy, serverError, onSubmit, onClose }: {
  lesson: LessonDetail
  busy: boolean
  serverError: string | null
  onSubmit: (v: { difficulties: string | null; recommendations: string | null }) => void
  onClose: () => void
}) {
  const base = useId()
  const [difficulties, setDifficulties] = useState(lesson.difficulties ?? '')
  const [recommendations, setRecommendations] = useState(lesson.recommendations ?? '')
  const tooLong = difficulties.trim().length > LIMITS.long || recommendations.trim().length > LIMITS.long
  return (
    <Modal title="Dificuldades e recomendações" onClose={onClose} closeDisabled={busy}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy && !tooLong) onSubmit({ difficulties: difficulties.trim() || null, recommendations: recommendations.trim() || null })
        }}
      >
        <div>
          <label htmlFor={`${base}-d`} className={field.label}>Dificuldades identificadas</label>
          <textarea id={`${base}-d`} data-autofocus rows={4} className={field.input} value={difficulties} onChange={(e) => setDifficulties(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${base}-r`} className={field.label}>Recomendações para estudos futuros</label>
          <textarea id={`${base}-r`} rows={4} className={field.input} value={recommendations} onChange={(e) => setRecommendations(e.target.value)} />
        </div>
        {tooLong && <p className={field.error}>Cada campo pode ter até {LIMITS.long} caracteres.</p>}
        {serverError && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{serverError}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className={btn.primary} disabled={busy || tooLong}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function TextBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-800">{value || <span className="text-slate-400">—</span>}</dd>
    </div>
  )
}

// ---------- página ----------
export function LessonDetailPage() {
  const { lessonId = '' } = useParams()
  const service = useLessonService()
  const { user } = useAuth()
  const navigate = useNavigate()
  const selectId = useId()
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newBlock, setNewBlock] = useState<BlockType | ''>('')

  const key = reloadKey
  useEffect(() => {
    let active = true
    service
      .get(lessonId)
      .then((lesson) => active && setResult({ key, status: 'ready', lesson }))
      .catch(() => active && setResult({ key, status: 'error' }))
    return () => {
      active = false
    }
  }, [service, lessonId, key])

  const state = result && result.key === key ? result : null
  const lesson = state?.status === 'ready' ? state.lesson : null

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
      setActionError(e instanceof LessonError ? e.userMessage : LESSON_MESSAGES.save)
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

  if (!state) return <LoadingState label="Carregando aula…" />
  if (state.status === 'error') return <ErrorState message={LESSON_MESSAGES.loadOne} onRetry={() => setReloadKey((k) => k + 1)} />
  if (!lesson) {
    return (
      <section>
        <p className="mb-4 rounded-lg border border-dashed border-slate-300 bg-white p-5 text-slate-700">{LESSON_MESSAGES.notFound}</p>
        <Link to="/lessons" className={btn.secondary}>Voltar às aulas</Link>
      </section>
    )
  }

  const blocks = sortBlocks(lesson.lesson_blocks)
  const missing = BLOCK_TYPES.filter((t) => !blocks.some((b) => b.block_type === t.value))
  const score = overallScore(blocks)
  const completed = lesson.status === 'completed'
  const exerciseCount = blocks.reduce((n, b) => n + b.lesson_exercises.length, 0)

  return (
    <section>
      <Link to="/lessons" className={`${btn.ghost} -ml-2 mb-3`}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        Aulas
      </Link>

      <header className="mb-4">
        <h1 className="break-words text-2xl font-semibold tracking-tight text-slate-900">
          Aula {lesson.lesson_number} — {lesson.title ?? 'Sem título'}
        </h1>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${completed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{STATUS_LABEL[lesson.status]}</span>
          <span>{lesson.studied_on ? formatDate(lesson.studied_on) : 'Sem data'}</span>
          {lesson.level && <span>Nível {lesson.level}</span>}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className={btn.secondary} onClick={() => open({ kind: 'editLesson' })}>
          <Pencil className="size-4" aria-hidden="true" />
          Editar dados
        </button>
        {completed ? (
          <button type="button" className={btn.secondary} disabled={busy} onClick={() => void run(() => service.setStatus(lesson.id, 'in_progress'), 'Aula reaberta.')}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Reabrir aula
          </button>
        ) : (
          <button type="button" className={btn.primary} disabled={busy} onClick={() => void run(() => service.setStatus(lesson.id, 'completed'), 'Aula concluída.')}>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Marcar como concluída
          </button>
        )}
        <button type="button" className={`${btn.secondary} text-red-700`} onClick={() => open({ kind: 'deleteLesson' })}>
          <Trash2 className="size-4" aria-hidden="true" />
          Excluir aula
        </button>
      </div>

      <div role="status" aria-live="polite">
        {notice && !dialog && <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      </div>
      {actionError && !dialog && (
        <div className="mb-4">
          <ErrorState message={actionError} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:col-span-1">
          <p className="text-sm font-medium text-slate-600">Nota geral</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900" aria-label={`Nota geral: ${formatScore(score)}`}>
            {formatScore(score)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Média simples das notas dos blocos avaliados (0–10), com 1 casa decimal. Blocos sem nota não entram.</p>
        </div>
        <dl className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2">
          <TextBlock label="Assuntos estudados" value={lesson.topics.join(' · ')} />
          <TextBlock label="Observações" value={lesson.report} />
        </dl>
      </div>

      <section aria-labelledby="blocks-heading" className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 id="blocks-heading" className="text-lg font-semibold text-slate-900">
            Blocos de estudo <span className="text-sm font-normal text-slate-500">({blocks.length} · {exerciseCount} {exerciseCount === 1 ? 'exercício' : 'exercícios'})</span>
          </h2>
          {missing.length > 0 && (
            <form
              className="flex w-full gap-2 sm:w-auto"
              onSubmit={(e) => {
                e.preventDefault()
                if (!newBlock || !user) return
                const type = newBlock
                void run(() => service.addBlock(user.id, lesson.id, type), `Bloco ${blockLabel(type)} adicionado.`, () => {
                  setNewBlock('')
                  setReloadKey((k) => k + 1)
                })
              }}
            >
              <label htmlFor={selectId} className="sr-only">Tipo de bloco</label>
              <select id={selectId} className={`${field.input} sm:w-44`} value={newBlock} onChange={(e) => setNewBlock(e.target.value as BlockType | '')}>
                <option value="">Tipo de bloco…</option>
                {missing.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button type="submit" className={btn.primary} disabled={!newBlock || busy}>
                <Plus className="size-4" aria-hidden="true" />
                Adicionar bloco
              </button>
            </form>
          )}
        </div>

        {blocks.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            Nenhum bloco ainda. Adicione os blocos estudados (gramática, vocabulário, listening…).
          </p>
        )}
        <div className="space-y-4">
          {blocks.map((b) => (
            <section key={b.id} aria-label={`Bloco ${blockLabel(b.block_type)}`} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{blockLabel(b.block_type)}</h3>
                <span className="text-sm text-slate-700">Nota: <strong className="tabular-nums">{formatScore(b.score === null ? null : Number(b.score))}</strong></span>
              </div>
              {b.notes && <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-600">{b.notes}</p>}
              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" className={btn.ghost} onClick={() => open({ kind: 'block', block: b })} aria-label={`Nota e observações do bloco ${blockLabel(b.block_type)}`}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Nota e observações
                </button>
                <button type="button" className={btn.ghost} onClick={() => open({ kind: 'addExercise', block: b })} aria-label={`Adicionar exercício em ${blockLabel(b.block_type)}`}>
                  <Plus className="size-4" aria-hidden="true" />
                  Exercício
                </button>
                <button type="button" className={`${btn.ghost} text-red-700 hover:bg-red-50`} onClick={() => open({ kind: 'deleteBlock', block: b })} aria-label={`Excluir bloco ${blockLabel(b.block_type)}`}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Excluir bloco
                </button>
              </div>

              {b.lesson_exercises.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Nenhum exercício neste bloco.</p>
              ) : (
                <ol className="mt-3 space-y-2" aria-label={`Exercícios de ${blockLabel(b.block_type)}`}>
                  {b.lesson_exercises.map((x, i) => (
                    <li key={x.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs font-medium text-slate-500">Exercício {i + 1}</p>
                      <dl className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="sm:col-span-2"><TextBlock label="Enunciado" value={x.prompt} /></div>
                        <TextBlock label="Minha resposta" value={x.my_answer} />
                        <TextBlock label="Resposta corrigida" value={x.corrected_answer} />
                        <div className="sm:col-span-2"><TextBlock label="Explicação" value={x.explanation} /></div>
                      </dl>
                      <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
                        <button type="button" className={btn.ghost} onClick={() => open({ kind: 'editExercise', block: b, exercise: x })} aria-label={`Editar exercício ${i + 1} de ${blockLabel(b.block_type)}`}>
                          <Pencil className="size-4" aria-hidden="true" />
                          Editar
                        </button>
                        <button type="button" className={`${btn.ghost} text-red-700 hover:bg-red-50`} onClick={() => open({ kind: 'deleteExercise', exercise: x })} aria-label={`Excluir exercício ${i + 1} de ${blockLabel(b.block_type)}`}>
                          <Trash2 className="size-4" aria-hidden="true" />
                          Excluir
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      </section>

      <section aria-labelledby="notes-heading" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="notes-heading" className="text-lg font-semibold text-slate-900">Dificuldades e recomendações</h2>
          <button type="button" className={btn.ghost} onClick={() => open({ kind: 'notes' })}>
            <Pencil className="size-4" aria-hidden="true" />
            Editar
          </button>
        </div>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextBlock label="Dificuldades identificadas" value={lesson.difficulties} />
          <TextBlock label="Recomendações para estudos futuros" value={lesson.recommendations} />
        </dl>
      </section>

      {/* ---------- diálogos ---------- */}
      {dialog?.kind === 'editLesson' && (
        <LessonForm
          editing
          initial={{
            lessonNumber: String(lesson.lesson_number),
            title: lesson.title ?? '',
            studiedOn: lesson.studied_on ?? '',
            level: lesson.level ?? '',
            topics: lesson.topics.join('\n'),
            report: lesson.report ?? '',
          }}
          busy={busy}
          serverError={actionError}
          onSubmit={(v: LessonValues) => void run(() => service.update(lesson.id, v), 'Aula atualizada.')}
          onClose={close}
        />
      )}
      {dialog?.kind === 'deleteLesson' && (
        <ConfirmDialog
          title="Excluir aula?"
          description={`A aula ${lesson.lesson_number}, seus ${blocks.length} blocos e ${exerciseCount} exercícios serão excluídos. Esta ação não pode ser desfeita.`}
          busy={busy}
          error={actionError}
          onConfirm={() => void run(() => service.remove(lesson.id), 'Aula excluída.', () => navigate('/lessons'))}
          onClose={close}
        />
      )}
      {dialog?.kind === 'notes' && (
        <NotesForm lesson={lesson} busy={busy} serverError={actionError} onSubmit={(v) => void run(() => service.update(lesson.id, v), 'Dificuldades e recomendações salvas.')} onClose={close} />
      )}
      {dialog?.kind === 'block' && (
        <BlockForm block={dialog.block} busy={busy} serverError={actionError} onSubmit={(v) => void run(() => service.updateBlock(dialog.block.id, v), 'Bloco atualizado.')} onClose={close} />
      )}
      {dialog?.kind === 'deleteBlock' && (
        <ConfirmDialog
          title={`Excluir bloco ${blockLabel(dialog.block.block_type)}?`}
          description={`O bloco e seus ${dialog.block.lesson_exercises.length} exercícios serão excluídos. Esta ação não pode ser desfeita.`}
          busy={busy}
          error={actionError}
          onConfirm={() => void run(() => service.removeBlock(dialog.block.id), 'Bloco excluído.')}
          onClose={close}
        />
      )}
      {(dialog?.kind === 'addExercise' || dialog?.kind === 'editExercise') && user && (
        <ExerciseForm
          blockLabel={blockLabel(dialog.block.block_type)}
          initial={
            dialog.kind === 'editExercise'
              ? {
                  prompt: dialog.exercise.prompt,
                  myAnswer: dialog.exercise.my_answer ?? '',
                  correctedAnswer: dialog.exercise.corrected_answer ?? '',
                  explanation: dialog.exercise.explanation ?? '',
                }
              : undefined
          }
          busy={busy}
          serverError={actionError}
          onSubmit={(v: ExerciseValues) =>
            void run(
              () => (dialog.kind === 'editExercise' ? service.updateExercise(dialog.exercise.id, v) : service.addExercise(user.id, dialog.block.id, v)),
              dialog.kind === 'editExercise' ? 'Exercício atualizado.' : 'Exercício adicionado.',
            )
          }
          onClose={close}
        />
      )}
      {dialog?.kind === 'deleteExercise' && (
        <ConfirmDialog
          title="Excluir exercício?"
          description="O exercício será excluído. Esta ação não pode ser desfeita."
          busy={busy}
          error={actionError}
          onConfirm={() => void run(() => service.removeExercise(dialog.exercise.id), 'Exercício excluído.')}
          onClose={close}
        />
      )}
    </section>
  )
}
