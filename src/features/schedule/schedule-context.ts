import { createContext, useContext } from 'react'
import type { ScheduleService } from './schedule-service'

export const ScheduleServiceContext = createContext<ScheduleService | null>(null)

export function useScheduleService(): ScheduleService {
  const service = useContext(ScheduleServiceContext)
  if (!service) throw new Error('useScheduleService deve ser usado dentro de <AppProviders>.')
  return service
}
