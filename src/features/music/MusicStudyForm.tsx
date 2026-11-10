import { useId, useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { btn, field } from '../../components/ui/styles'
import { LEVELS } from '../lessons/lesson-model'
import { COPYRIGHT_NOTE, validateStudy, type StudyErrors, type StudyInput, type StudyValues } from './music-model'

export function MusicStudyForm({ initial, editing, busy, serverError, onSubmit, onClose }: {
  initial: StudyInput
  editing: boolean
  busy: boolean
  serverError: string | null
  onSubmit: (v: StudyValues) => void
  onClose: () => void
}) {
  const base = useId()
  const id = (k: keyof StudyInput) => `${base}-${k}`
  const [input, setInput] = useState(initial)
  const [errors, setErrors] = useState<StudyErrors>({})
  const set = (k: keyof StudyInput, v: string) => {
    setInput((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }))
  }
  const a11y = (k: keyof StudyInput) => ({ id: id(k), 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `${id(k)}-error` : undefined })
  const err = (k: keyof StudyInput) => (errors[k] ? <p id={`${id(k)}-error`} className={field.error}>{errors[k]}</p> : null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const { values, errors: errs } = validateStudy(input)
    setErrors(errs)
    if (values) onSubmit(values)
  }

  return (
    <Modal title={editing ? 'Editar estudo musical' : 'Novo estudo musical'} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0">
            <label htmlFor={id('studyNumber')} className={field.label}>Número</label>
            <input {...a11y('studyNumber')} type="number" inputMode="numeric" min={1} className={field.input} value={input.studyNumber} onChange={(e) => set('studyNumber', e.target.value)} />
            {err('studyNumber')}
          </div>
          <div className="min-w-0">
            <label htmlFor={id('level')} className={field.label}>Nível</label>
            <select {...a11y('level')} className={field.input} value={input.level} onChange={(e) => set('level', e.target.value)}>
              <option value="">—</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            {err('level')}
          </div>
        </div>
        <div>
          <label htmlFor={id('song')} className={field.label}>Música</label>
          <input {...a11y('song')} data-autofocus lang="en" className={field.input} value={input.song} onChange={(e) => set('song', e.target.value)} />
          {err('song')}
        </div>
        <div>
          <label htmlFor={id('artist')} className={field.label}>Artista</label>
          <input {...a11y('artist')} className={field.input} value={input.artist} onChange={(e) => set('artist', e.target.value)} />
          {err('artist')}
        </div>
        <div>
          <label htmlFor={id('studiedOn')} className={field.label}>Data</label>
          <input {...a11y('studiedOn')} type="date" className={field.input} value={input.studiedOn} onChange={(e) => set('studiedOn', e.target.value)} />
          {err('studiedOn')}
        </div>
        <div>
          <label htmlFor={id('report')} className={field.label}>Observações gerais <span className="font-normal text-slate-500">(opcional)</span></label>
          <textarea {...a11y('report')} rows={3} className={field.input} value={input.report} onChange={(e) => set('report', e.target.value)} />
          {err('report')}
        </div>
        <p className={field.hint}>{COPYRIGHT_NOTE}</p>
        {serverError && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{serverError}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className={btn.primary} disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar' : 'Criar estudo'}</button>
        </div>
      </form>
    </Modal>
  )
}
