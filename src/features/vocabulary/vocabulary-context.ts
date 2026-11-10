import { createContext, useContext } from 'react'
import type { VocabularyService } from './vocabulary-service'

export const VocabularyServiceContext = createContext<VocabularyService | null>(null)

export function useVocabularyService(): VocabularyService {
  const service = useContext(VocabularyServiceContext)
  if (!service) throw new Error('useVocabularyService deve ser usado dentro de <AppProviders>.')
  return service
}
