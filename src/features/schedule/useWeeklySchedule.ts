import { useCallback, useEffect, useState } from 'react'
import type { WeekData } from './schedule-model'
import { useScheduleService } from './schedule-context'
import { SCHEDULE_MESSAGES, ScheduleError } from './schedule-service'
import type { IsoDate } from './week'

type Result =
  | { key: string; status: 'ready'; data: WeekData }
  | { key: string; status: 'error'; message: string }

export type WeekState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: WeekData }

function messageOf(e: unknown, fallback: string): string {
  return e instanceof ScheduleError ? e.userMessage : fallback
}

/**
 * Carrega uma semana e executa mutações SEM atualização otimista:
 * cada ação aguarda o servidor e recarrega a semana, mantendo a UI consistente após falhas.
 */
export function useWeeklySchedule(weekStart: IsoDate) {
  const service = useScheduleService()
  const [reloadKey, setReloadKey] = useState(0)
  const key = `${weekStart}:${reloadKey}`
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    service
      .loadWeek(weekStart)
      .then((data) => active && setResult({ key, status: 'ready', data }))
      .catch((e: unknown) => active && setResult({ key, status: 'error', message: messageOf(e, SCHEDULE_MESSAGES.load) }))
    return () => {
      active = false
    }
  }, [service, weekStart, key])

  const state: WeekState = result && result.key === key ? result : { status: 'loading' }

  const reload = useCallback(() => {
    setActionError(null)
    setNotice(null)
    setReloadKey((k) => k + 1)
  }, [])

  /** Executa uma mutação; em caso de sucesso recarrega e mostra `successMessage`. Retorna true se deu certo. */
  const run = useCallback(
    async (mutation: () => Promise<void>, successMessage: string): Promise<boolean> => {
      if (busy) return false
      setBusy(true)
      setActionError(null)
      setNotice(null)
      let ok = false
      try {
        await mutation()
        ok = true
      } catch (e) {
        setActionError(messageOf(e, SCHEDULE_MESSAGES.save))
      }
      // Recarrega sempre (sucesso ou falha) para refletir o estado real do servidor.
      try {
        const data = await service.loadWeek(weekStart)
        setResult({ key, status: 'ready', data })
        if (ok) setNotice(successMessage)
      } catch (e) {
        setResult({ key, status: 'error', message: messageOf(e, SCHEDULE_MESSAGES.load) })
      } finally {
        setBusy(false)
      }
      return ok
    },
    [busy, service, weekStart, key],
  )

  const clearActionError = useCallback(() => setActionError(null), [])

  return { state, busy, actionError, notice, run, reload, clearActionError }
}
