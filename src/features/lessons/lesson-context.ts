import { createContext, useContext } from 'react'
import type { LessonService } from './lesson-service'

export const LessonServiceContext = createContext<LessonService | null>(null)

export function useLessonService(): LessonService {
  const service = useContext(LessonServiceContext)
  if (!service) throw new Error('useLessonService deve ser usado dentro de <AppProviders>.')
  return service
}
