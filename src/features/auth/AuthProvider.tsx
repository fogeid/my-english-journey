import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { DbClient } from '../../lib/supabase-context'
import {
  AUTH_MESSAGES,
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
  type Profile,
  type ProfileStatus,
} from './auth-context'

interface ProfileState {
  /** chave da requisição que produziu este resultado */
  key: string | null
  profile: Profile | null
  status: ProfileStatus
}

const IDLE_PROFILE: ProfileState = { key: null, profile: null, status: 'idle' }

export function AuthProvider({ client, children }: { client: DbClient; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [profileState, setProfileState] = useState<ProfileState>(IDLE_PROFILE)
  const [profileReloadKey, setProfileReloadKey] = useState(0)

  // Sessão inicial (persistida pelo supabase-js) + listener de mudanças, com cleanup.
  useEffect(() => {
    let active = true

    const apply = (next: Session | null) => {
      if (!active) return
      setSession(next)
      setStatus(next ? 'authenticated' : 'unauthenticated')
    }

    client.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null))

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => apply(next))

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [client])

  const userId = session?.user.id ?? null

  // Chave da requisição de perfil: enquanto o resultado guardado não corresponde a ela,
  // o estado derivado é "loading" (sem setState síncrono no effect).
  const profileKey = userId ? `${userId}:${profileReloadKey}` : null

  // Ao autenticar: garantir o perfil via RPC (SECURITY DEFINER) e carregá-lo.
  // Falhas viram estado de erro; nunca se cria um perfil local.
  useEffect(() => {
    if (!userId || !profileKey) return
    let active = true

    const fail = () => {
      if (active) setProfileState({ key: profileKey, profile: null, status: 'error' })
    }

    Promise.resolve(client.rpc('create_my_profile'))
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data || data.user_id !== userId) return fail()
        setProfileState({ key: profileKey, profile: data, status: 'ready' })
      })
      .catch(fail)

    return () => {
      active = false
    }
  }, [client, userId, profileKey])

  const signIn = useCallback<AuthContextValue['signIn']>(
    async (email, password) => {
      try {
        const { error } = await client.auth.signInWithPassword({ email, password })
        if (!error) return { error: null }
        const invalid = error.code === 'invalid_credentials' || error.status === 400
        return { error: invalid ? AUTH_MESSAGES.invalidCredentials : AUTH_MESSAGES.generic }
      } catch {
        return { error: AUTH_MESSAGES.generic }
      }
    },
    [client],
  )

  const signOut = useCallback(async () => {
    try {
      const { error } = await client.auth.signOut()
      // Se a revogação no servidor falhar (ex.: offline), ao menos remove a sessão local.
      if (error) await client.auth.signOut({ scope: 'local' })
    } catch {
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
    } finally {
      setSession(null)
      setStatus('unauthenticated')
      setProfileState(IDLE_PROFILE)
    }
  }, [client])

  const reloadProfile = useCallback(() => setProfileReloadKey((k) => k + 1), [])

  const value = useMemo<AuthContextValue>(() => {
    const current = profileKey && profileState.key === profileKey ? profileState : null
    return {
      status,
      session,
      user: session?.user ?? null,
      profile: current?.profile ?? null,
      profileStatus: userId ? (current?.status ?? 'loading') : 'idle',
      signIn,
      signOut,
      reloadProfile,
    }
  }, [status, session, userId, profileKey, profileState, signIn, signOut, reloadProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
