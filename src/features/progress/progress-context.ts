import { createContext, useContext } from 'react'
import type { ProgressService } from './progress-service'

export const ProgressServiceContext = createContext<ProgressService | null>(null)

export function useProgressService(): ProgressService {
  const service = useContext(ProgressServiceContext)
  if (!service) throw new Error('useProgressService deve ser usado dentro de <AppProviders>.')
  return service
}
