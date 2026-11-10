import type { DbClient } from '../../lib/supabase-context'
import type { RawProgressData } from './progress-model'

export const PROGRESS_MESSAGES = {
  load: 'Não foi possível carregar o progresso. Verifique sua conexão e tente novamente.',
} as const

export interface ProgressService {
  /** fromInstant: só registros com data/hora >= este instante (null = tudo). RLS limita ao próprio usuário. */
  load(fromInstant: Date | null): Promise<RawProgressData>
}

const PAGE = 1000 // limite de linhas por requisição do PostgREST (supabase/config.toml: max_rows)

/** Lê todas as páginas de uma consulta ordenada (evita truncar silenciosamente em 1000 linhas). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error || !data) throw new Error('progress_load_failed', { cause: error })
    out.push(...data)
    if (data.length < PAGE) return out
  }
}

export function createSupabaseProgressService(client: DbClient): ProgressService {
  return {
    async load(fromInstant) {
      const since = fromInstant?.toISOString()
      const sinceDay = since?.slice(0, 10)

      const [sessions, activities, lessons, vocabulary, reviews, music] = await Promise.all([
        fetchAll((a, b) => {
          let q = client.from('study_sessions').select('id, actual_minutes, is_completed, completed_at, activity_id')
          if (since) q = q.gte('completed_at', since)
          return q.order('completed_at').order('id').range(a, b)
        }),
        fetchAll((a, b) => {
          let q = client.from('study_activities').select('id, study_day, planned_minutes')
          if (sinceDay) q = q.gte('study_day', sinceDay)
          return q.order('study_day').order('id').range(a, b)
        }),
        fetchAll((a, b) =>
          client
            .from('lessons')
            .select('id, lesson_number, title, studied_on, status, difficulties, recommendations, lesson_blocks(block_type, score)')
            .order('lesson_number')
            .range(a, b),
        ),
        fetchAll((a, b) => client.from('vocabulary').select('id, created_at').order('created_at').order('id').range(a, b)),
        fetchAll((a, b) => {
          let q = client.from('vocabulary_reviews').select('id, reviewed_at')
          if (since) q = q.gte('reviewed_at', since)
          return q.order('reviewed_at').order('id').range(a, b)
        }),
        fetchAll((a, b) => {
          let q = client.from('music_studies').select('id, studied_on, status').eq('status', 'completed')
          if (sinceDay) q = q.gte('studied_on', sinceDay)
          return q.order('studied_on').order('id').range(a, b)
        }),
      ])

      return {
        sessions,
        activities,
        lessons,
        vocabularyCreatedAt: vocabulary.map((v) => v.created_at),
        reviewedAt: reviews.map((r) => r.reviewed_at),
        musicStudies: music.map((m) => ({ studied_on: m.studied_on, status: m.status })),
      }
    },
  }
}
