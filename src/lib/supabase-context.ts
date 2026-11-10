import { createContext, useContext } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type DbClient = SupabaseClient<Database>

export const SupabaseContext = createContext<DbClient | null>(null)

export function useSupabase(): DbClient {
  const client = useContext(SupabaseContext)
  if (!client) throw new Error('useSupabase deve ser usado dentro de <AppProviders>.')
  return client
}
