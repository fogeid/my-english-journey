import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/lib/database.types'

/**
 * Remove uma conta FICTÍCIA de teste do Supabase LOCAL.
 *
 * Desde a ET-002, atividades com execução não podem ser excluídas — nem em cascata.
 * Por isso a exclusão da conta falha enquanto houver histórico. Aqui, e só aqui
 * (Node, service_role, banco local, contas criadas pelo próprio teste), o histórico
 * é apagado EXPLICITAMENTE antes, e qualquer erro interrompe a limpeza.
 */
export async function deleteLocalTestAccount(admin: SupabaseClient<Database>, userId: string): Promise<void> {
  const sessions = await admin.from('study_sessions').delete().eq('user_id', userId)
  if (sessions.error) throw new Error(`limpeza de study_sessions falhou: ${sessions.error.message}`)
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error(`deleteUser falhou: ${error.message}`)
}
