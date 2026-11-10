import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Database } from '../../lib/database.types'

export type Profile = Database['public']['Tables']['profiles']['Row']

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'
export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface SignInResult {
  error: string | null
}

export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  user: User | null
  profile: Profile | null
  profileStatus: ProfileStatus
  signIn: (email: string, password: string) => Promise<SignInResult>
  signOut: () => Promise<void>
  reloadProfile: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>.')
  return ctx
}

/** Mensagens exibidas ao usuário: genéricas, sem detalhes do servidor. */
export const AUTH_MESSAGES = {
  invalidCredentials: 'E-mail ou senha inválidos.',
  generic: 'Não foi possível entrar agora. Tente novamente em instantes.',
  profile: 'Não foi possível carregar seu perfil.',
} as const
