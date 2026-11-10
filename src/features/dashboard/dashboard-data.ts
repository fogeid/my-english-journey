import type { DbClient } from '../../lib/supabase-context'

export interface DashboardCounts {
  lessons: number
  /** aulas com status concluída (ET-004) */
  completedLessons: number
  /** estudos musicais concluídos (ET-006) */
  completedMusic: number
  musicStudies: number
  vocabulary: number
  pendingReviews: number
  /** palavras nunca revisadas (ET-003); não somadas às pendentes */
  newWords: number
}

/**
 * Contagens reais do usuário (somente cabeçalhos, sem trazer linhas).
 * O filtro por user_id é explícito, além do isolamento garantido pelo RLS.
 * Qualquer erro é propagado; nunca retornamos valores inventados.
 * Revisões pendentes (vencidas) e palavras novas vêm de get_vocabulary_summary (hora do SERVIDOR),
 * a mesma regra usada pela fila de /reviews.
 */
export async function fetchDashboardCounts(client: DbClient, userId: string): Promise<DashboardCounts> {
  const head = { count: 'exact', head: true } as const

  const [lessons, completed, music, completedMusic, vocabulary, summary] = await Promise.all([
    client.from('lessons').select('id', head).eq('user_id', userId),
    client.from('lessons').select('id', head).eq('user_id', userId).eq('status', 'completed'),
    client.from('music_studies').select('id', head).eq('user_id', userId),
    client.from('music_studies').select('id', head).eq('user_id', userId).eq('status', 'completed'),
    client.from('vocabulary').select('id', head).eq('user_id', userId),
    client.rpc('get_vocabulary_summary'),
  ])

  const failed = [lessons, completed, music, completedMusic, vocabulary].find((r) => r.error || r.count === null)
  if (failed || summary.error || !summary.data || summary.data.length !== 1) throw new Error('dashboard_counts_failed')
  const s = summary.data[0]

  return {
    lessons: lessons.count ?? 0,
    completedLessons: completed.count ?? 0,
    musicStudies: music.count ?? 0,
    completedMusic: completedMusic.count ?? 0,
    vocabulary: vocabulary.count ?? 0,
    pendingReviews: s.due,
    newWords: s.new_words,
  }
}
