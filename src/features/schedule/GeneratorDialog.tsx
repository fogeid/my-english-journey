import { useId, useState, type FormEvent } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { btn, field } from '../../components/ui/styles'
import { CATEGORY_LABELS } from './schedule-model'
import { useScheduleService } from './schedule-context'
import { SCHEDULE_MESSAGES, ScheduleError } from './schedule-service'
import { buildPreview, toPayload, validateConfig, type GeneratorConfig, type PreviewItem } from './schedule-generator'
import { addDays, formatDate, formatDayLabel } from './week'

const STATUS_BADGE: Record<PreviewItem['status'], { label: string; cls: string }> = {
  new: { label: 'Nova', cls: 'bg-emerald-50 text-emerald-700' },
  exists: { label: 'Já existe', cls: 'bg-slate-100 text-slate-600' },
  conflict: { label: 'Conflito', cls: 'bg-amber-50 text-amber-800' },
}

/**
 * Gerador de cronograma (ET-007): configuração → prévia (com conflitos) → gravação atômica.
 * Nada é gravado antes da confirmação; itens existentes/em conflito nunca são sobrescritos.
 */
export function GeneratorDialog({
  defaultStart,
  onClose,
  onGenerated,
}: {
  defaultStart: string
  onClose: () => void
  onGenerated: (result: { created: number; skipped: number; startDate: string }) => void
}) {
  const service = useScheduleService()
  const base = useId()
  const [form, setForm] = useState({ startDate: defaultStart, days: '7', nextLesson: '4', nextMusic: '2', lessonMinutes: '60', musicMinutes: '60', includeComplementary: true })
  const [errors, setErrors] = useState<string[]>([])
  const [preview, setPreview] = useState<{ config: GeneratorConfig; items: PreviewItem[] } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const config = (): GeneratorConfig => ({
    startDate: form.startDate,
    days: Number(form.days),
    nextLesson: Number(form.nextLesson),
    nextMusic: Number(form.nextMusic),
    lessonMinutes: Number(form.lessonMinutes),
    musicMinutes: Number(form.musicMinutes),
    includeComplementary: form.includeComplementary,
  })

  const makePreview = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const c = config()
    const errs = validateConfig(c)
    setErrors(errs)
    setServerError(null)
    if (errs.length) return
    setBusy(true)
    try {
      const ctx = await service.loadGeneratorContext(c.startDate, addDays(c.startDate, c.days - 1))
      const items = buildPreview(c, ctx)
      setPreview({ config: c, items })
      setSelected(new Set(items.filter((i) => i.status === 'new').map((i) => i.generator_key)))
    } catch (err) {
      setServerError(err instanceof ScheduleError ? err.userMessage : SCHEDULE_MESSAGES.load)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!preview || busy) return
    const chosen = preview.items.filter((i) => i.status === 'new' && selected.has(i.generator_key))
    if (chosen.length === 0) return
    setBusy(true)
    setServerError(null)
    try {
      const result = await service.generate(toPayload(chosen))
      onGenerated({ ...result, startDate: preview.config.startDate })
    } catch (err) {
      setServerError(err instanceof ScheduleError ? err.userMessage : SCHEDULE_MESSAGES.generate)
      setBusy(false)
    }
  }

  const set = (k: keyof typeof form, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }))
  const num = (k: 'days' | 'nextLesson' | 'nextMusic' | 'lessonMinutes' | 'musicMinutes', label: string, min: number, max: number) => (
    <div className="min-w-0">
      <label htmlFor={`${base}-${k}`} className={field.label}>
        {label}
      </label>
      <input id={`${base}-${k}`} type="number" inputMode="numeric" min={min} max={max} className={field.input} value={form[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  )

  if (!preview) {
    return (
      <Modal title="Gerar cronograma semanal" description="Aula ChatGPT e estudo musical por dia (com etapas), mais complementares. Você revisa antes de gravar." onClose={onClose} closeDisabled={busy}>
        <form onSubmit={makePreview} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <label htmlFor={`${base}-start`} className={field.label}>
                Data de início
              </label>
              <input id={`${base}-start`} type="date" data-autofocus className={field.input} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </div>
            {num('days', 'Quantidade de dias', 1, 14)}
            {num('nextLesson', 'Próxima aula nº', 1, 999)}
            {num('nextMusic', 'Próximo estudo musical nº', 1, 999)}
            {num('lessonMinutes', 'Duração da aula (min)', 6, 240)}
            {num('musicMinutes', 'Duração do estudo musical (min)', 5, 240)}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4 accent-indigo-600" checked={form.includeComplementary} onChange={(e) => set('includeComplementary', e.target.checked)} />
            Incluir atividades complementares (ciclo por dia da semana)
          </label>
          {errors.length > 0 && (
            <ul role="alert" className="list-inside list-disc rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {serverError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {serverError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className={btn.primary} disabled={busy}>
              {busy ? 'Verificando…' : 'Ver prévia'}
            </button>
          </div>
        </form>
      </Modal>
    )
  }

  const { items, config: c } = preview
  const counts = { new: 0, exists: 0, conflict: 0 }
  for (const i of items) counts[i.status]++
  const chosen = items.filter((i) => i.status === 'new' && selected.has(i.generator_key))
  const chosenMinutes = chosen.reduce((n, i) => n + i.planned_minutes, 0)
  const unplanned = items.filter((i) => i.unplanned && i.status === 'new')
  const days = [...new Set(items.map((i) => i.study_day))]

  return (
    <Modal
      title="Prévia do cronograma"
      description={`${formatDate(c.startDate)} a ${formatDate(addDays(c.startDate, c.days - 1))} · ${counts.new} novas · ${counts.exists} já existem · ${counts.conflict} conflitos`}
      onClose={onClose}
      closeDisabled={busy}
    >
      {(counts.exists > 0 || counts.conflict > 0) && (
        <p role="status" className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Itens que já existem ou entram em conflito <strong>não serão gravados</strong> nem sobrescritos. Apenas os registros ausentes serão criados.
          </span>
        </p>
      )}
      {unplanned.length > 0 && (
        <p className="mb-3 text-sm text-slate-600">
          {unplanned.length} {unplanned.length === 1 ? 'item não tem' : 'itens não têm'} tema planejado (aulas 04–10 e músicas 02–08 estão planejadas); edite depois de gerar.
        </p>
      )}

      <div className="space-y-4">
        {days.map((day) => (
          <section key={day} aria-label={`Prévia de ${formatDayLabel(day)}`}>
            <h3 className="mb-1 text-sm font-semibold text-slate-900 first-letter:uppercase">{formatDayLabel(day)}</h3>
            <ul className="space-y-1">
              {items
                .filter((i) => i.study_day === day)
                .map((i) => {
                  const badge = STATUS_BADGE[i.status]
                  const id = `${base}-${i.generator_key}`
                  return (
                    <li key={i.generator_key} className="rounded-md border border-slate-200 p-2">
                      <div className="flex items-start gap-2">
                        <input
                          id={id}
                          type="checkbox"
                          className="mt-1 size-4 shrink-0 accent-indigo-600"
                          checked={i.status === 'new' && selected.has(i.generator_key)}
                          disabled={i.status !== 'new' || busy}
                          onChange={(e) =>
                            setSelected((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(i.generator_key)
                              else next.delete(i.generator_key)
                              return next
                            })
                          }
                        />
                        <label htmlFor={id} className="min-w-0 flex-1 text-sm">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="break-words font-medium text-slate-900">{i.title}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                          </span>
                          <span className="block text-xs text-slate-600">
                            {CATEGORY_LABELS[i.skill] ?? i.skill} · {i.planned_minutes} min
                            {i.steps.length > 0 && ` · ${i.steps.length} etapas`}
                          </span>
                          {i.reason && <span className="block text-xs text-amber-800">{i.reason}</span>}
                        </label>
                      </div>
                    </li>
                  )
                })}
            </ul>
          </section>
        ))}
      </div>

      {serverError && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {serverError}
        </p>
      )}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className={btn.secondary} onClick={() => setPreview(null)} disabled={busy}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar
        </button>
        <button type="button" className={btn.primary} onClick={() => void confirm()} disabled={busy || chosen.length === 0}>
          {chosen.length === 0 ? <Copy className="size-4" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
          {busy ? 'Gravando…' : chosen.length === 0 ? 'Nada novo para gravar' : `Gravar ${chosen.length} ${chosen.length === 1 ? 'atividade' : 'atividades'} (${chosenMinutes} min)`}
        </button>
      </div>
    </Modal>
  )
}
