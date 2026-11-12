import { useId, useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { btn, field } from '../../components/ui/styles'
import {
  EMPTY_INPUT,
  LIMITS,
  PART_OF_SPEECH,
  validateVocabulary,
  type VocabularyErrors,
  type VocabularyInput,
  type VocabularyValues,
} from './vocabulary-model'
import type { SourceOption } from './vocabulary-service'

type FieldKey = keyof VocabularyInput

export function VocabularyForm({
  initial,
  editing,
  sources,
  busy,
  serverError,
  onSubmit,
  onClose,
}: {
  initial?: VocabularyInput
  editing: boolean
  sources: SourceOption[]
  busy: boolean
  serverError: string | null
  onSubmit: (values: VocabularyValues) => void
  onClose: () => void
}) {
  const base = useId()
  const id = (k: FieldKey) => `${base}-${k}`
  const [input, setInput] = useState<VocabularyInput>(initial ?? EMPTY_INPUT)
  const [errors, setErrors] = useState<VocabularyErrors>({})

  const set = (k: FieldKey, v: string) => {
    setInput((prev) => ({ ...prev, [k]: v }))
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }))
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const { values, errors: errs } = validateVocabulary(input)
    setErrors(errs)
    if (values) onSubmit(values)
  }

  const a11y = (k: FieldKey) => ({
    id: id(k),
    'aria-invalid': !!errors[k],
    'aria-describedby': errors[k] ? `${id(k)}-error` : undefined,
  })
  const error = (k: FieldKey) =>
    errors[k] ? (
      <p id={`${id(k)}-error`} className={field.error}>
        {errors[k]}
      </p>
    ) : null

  // Uma origem já gravada que não está mais na lista continua visível.
  const options = [...sources]
  if (input.source && !options.some((o) => o.value === input.source)) options.push({ value: input.source, label: 'Origem atual' })

  return (
    <Modal title={editing ? 'Editar palavra' : 'Adicionar palavra'} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor={id('word')} className={field.label}>
            Palavra ou expressão (inglês)
          </label>
          <input {...a11y('word')} data-autofocus lang="en" className={field.input} value={input.word} onChange={(e) => set('word', e.target.value)} />
          {error('word')}
        </div>
        <div>
          <label htmlFor={id('translation')} className={field.label}>
            Tradução (português)
          </label>
          <input {...a11y('translation')} className={field.input} value={input.translation} onChange={(e) => set('translation', e.target.value)} />
          {error('translation')}
        </div>
        <div>
          <label htmlFor={id('example1')} className={field.label}>
            Exemplo 1 (inglês) <span className="font-normal text-slate-500">(opcional)</span>
          </label>
          <textarea {...a11y('example1')} lang="en" rows={2} className={field.input} value={input.example1} onChange={(e) => set('example1', e.target.value)} />
          {error('example1')}
        </div>
        <div>
          <label htmlFor={id('example2')} className={field.label}>
            Exemplo 2 (inglês) <span className="font-normal text-slate-500">(opcional)</span>
          </label>
          <textarea {...a11y('example2')} lang="en" rows={2} className={field.input} value={input.example2} onChange={(e) => set('example2', e.target.value)} />
          {error('example2')}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={id('partOfSpeech')} className={field.label}>
              Categoria <span className="font-normal text-slate-500">(opcional)</span>
            </label>
            <select {...a11y('partOfSpeech')} className={field.input} value={input.partOfSpeech} onChange={(e) => set('partOfSpeech', e.target.value)}>
              <option value="">—</option>
              {PART_OF_SPEECH.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {error('partOfSpeech')}
          </div>
          <div className="min-w-0">
            <label htmlFor={id('source')} className={field.label}>
              Origem
            </label>
            <select {...a11y('source')} className={field.input} value={input.source} onChange={(e) => set('source', e.target.value)}>
              <option value="">Manual</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {error('source')}
          </div>
        </div>

        <div>
          <label htmlFor={id('notes')} className={field.label}>
            Notas <span className="font-normal text-slate-500">(opcional)</span>
          </label>
          <textarea {...a11y('notes')} rows={2} maxLength={LIMITS.notes + 50} className={field.input} value={input.notes} onChange={(e) => set('notes', e.target.value)} />
          {error('notes')}
        </div>

        {editing && <p className={field.hint}>Editar não altera a data da próxima revisão nem o histórico.</p>}

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
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
