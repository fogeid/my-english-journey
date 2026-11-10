import { createContext, useContext } from 'react'
import type { MusicService } from './music-service'

export const MusicServiceContext = createContext<MusicService | null>(null)

export function useMusicService(): MusicService {
  const service = useContext(MusicServiceContext)
  if (!service) throw new Error('useMusicService deve ser usado dentro de <AppProviders>.')
  return service
}
