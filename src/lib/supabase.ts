import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local (veja .env.example).',
  )
}

/**
 * Cliente único do navegador. Usa apenas a anon key: o acesso aos dados é
 * limitado pelas políticas RLS. Nunca usar a service_role key no frontend.
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export type AppSupabaseClient = typeof supabase
