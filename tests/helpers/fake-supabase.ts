import type { Session } from '@supabase/supabase-js'
import type { DbClient } from '../../src/lib/supabase-context'
import type { Profile } from '../../src/features/auth/auth-context'

/**
 * Cliente Supabase falso para testes unitários de UI.
 * Simula: sessão persistida num "storage" compartilhado (para testar reload),
 * onAuthStateChange, signInWithPassword, signOut, RPC create_my_profile e
 * contagens com { count, head }. Nada aqui é dado real do usuário.
 */
export interface FakeOptions {
  /** credenciais aceitas pelo signIn */
  credentials?: { email: string; password: string }
  /** contagens retornadas por tabela; default 0 */
  /** vocabulary_pending/vocabulary_new alimentam a RPC get_vocabulary_summary (ET-003) */
  counts?: Partial<Record<'lessons' | 'music_studies' | 'vocabulary' | 'vocabulary_pending' | 'vocabulary_new' | 'lessons_completed' | 'music_studies_completed', number>>
  profileError?: boolean
  countsError?: boolean
  /** mensagem crua que o servidor devolveria em credenciais inválidas */
  rawAuthErrorMessage?: string
  /** resposta da RPC get_week_summary (ET-002); default: semana sem plano, zeros */
  weekSummary?: { has_plan: boolean; planned_count: number; planned_minutes: number; completed_count: number; completed_minutes: number }
  weekSummaryError?: boolean
}

export interface FakeStorage {
  session: Session | null
}

export const TEST_USER_ID = '00000000-0000-4000-8000-000000000001'

export function makeSession(email = 'aluno@example.test'): Session {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: TEST_USER_ID,
      email,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    },
  }
}

export function createFakeSupabase(storage: FakeStorage, options: FakeOptions = {}) {
  type Listener = (event: string, session: Session | null) => void
  const listeners = new Set<Listener>()
  const emit = (event: string) => listeners.forEach((l) => l(event, storage.session))
  const calls = { rpc: 0, signOut: 0, unsubscribe: 0, countQueries: [] as string[], weekSummaryArgs: [] as unknown[] }

  const profile: Profile = {
    user_id: TEST_USER_ID,
    display_name: null,
    current_level: 'A1',
    daily_goal_minutes: 60,
    created_at: new Date(0).toISOString(),
  }

  const auth = {
    getSession: async () => ({ data: { session: storage.session }, error: null }),
    onAuthStateChange: (cb: Listener) => {
      listeners.add(cb)
      queueMicrotask(() => cb('INITIAL_SESSION', storage.session))
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              calls.unsubscribe++
              listeners.delete(cb)
            },
          },
        },
      }
    },
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      const ok =
        options.credentials && options.credentials.email === email && options.credentials.password === password
      if (!ok) {
        return {
          data: { user: null, session: null },
          error: {
            name: 'AuthApiError',
            code: 'invalid_credentials',
            status: 400,
            message: options.rawAuthErrorMessage ?? 'Invalid login credentials',
          },
        }
      }
      storage.session = makeSession(email)
      emit('SIGNED_IN')
      return { data: { user: storage.session.user, session: storage.session }, error: null }
    },
    signOut: async () => {
      calls.signOut++
      storage.session = null
      emit('SIGNED_OUT')
      return { error: null }
    },
  }

  const rpc = async (fn: string, args?: unknown) => {
    if (fn === 'get_vocabulary_summary') {
      calls.countQueries.push('vocabulary_summary')
      if (options.countsError) return { data: null, error: { message: 'boom' } }
      const c = options.counts ?? {}
      return {
        data: [{ total: c.vocabulary ?? 0, due: c.vocabulary_pending ?? 0, new_words: c.vocabulary_new ?? 0, server_now: new Date().toISOString() }],
        error: null,
      }
    }
    if (fn === 'get_week_summary') {
      calls.weekSummaryArgs.push(args)
      if (options.weekSummaryError) return { data: null, error: { message: 'rpc failed', code: 'XX000' } }
      const summary = options.weekSummary ?? {
        has_plan: false,
        planned_count: 0,
        planned_minutes: 0,
        completed_count: 0,
        completed_minutes: 0,
      }
      return { data: [summary], error: null }
    }
    calls.rpc++
    if (fn !== 'create_my_profile' || options.profileError) {
      return { data: null, error: { message: 'rpc failed', code: 'XX000' } }
    }
    return { data: profile, error: null }
  }

  const from = (table: string) => {
    let pending = false
    let completed = false
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        if (column === 'status' && value === 'completed') completed = true
        return builder
      },
      lte: (column: string) => {
        if (column === 'next_review_at') pending = true
        return builder
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        const key =
          table === 'vocabulary' && pending ? 'vocabulary_pending' : table === 'lessons' && completed ? 'lessons_completed' : table === 'music_studies' && completed ? 'music_studies_completed' : table
        calls.countQueries.push(key)
        const value = options.countsError
          ? { data: null, count: null, error: { message: 'boom' } }
          : { data: null, count: options.counts?.[key as keyof NonNullable<FakeOptions['counts']>] ?? 0, error: null }
        return Promise.resolve(value).then(resolve, reject)
      },
    }
    return builder
  }

  const client = { auth, rpc, from } as unknown as DbClient
  return { client, calls, storage }
}
