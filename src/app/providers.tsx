import { useMemo, type ReactNode } from 'react'
import { AuthProvider } from '../features/auth/AuthProvider'
import { LessonServiceContext } from '../features/lessons/lesson-context'
import { createSupabaseLessonService, type LessonService } from '../features/lessons/lesson-service'
import { MusicServiceContext } from '../features/music/music-context'
import { createSupabaseMusicService, type MusicService } from '../features/music/music-service'
import { ProgressServiceContext } from '../features/progress/progress-context'
import { createSupabaseProgressService, type ProgressService } from '../features/progress/progress-service'
import { ScheduleServiceContext } from '../features/schedule/schedule-context'
import { createSupabaseScheduleService, type ScheduleService } from '../features/schedule/schedule-service'
import { VocabularyServiceContext } from '../features/vocabulary/vocabulary-context'
import { createSupabaseVocabularyService, type VocabularyService } from '../features/vocabulary/vocabulary-service'
import { SupabaseContext, type DbClient } from '../lib/supabase-context'

export function AppProviders({
  client,
  scheduleService,
  vocabularyService,
  lessonService,
  progressService,
  musicService,
  children,
}: {
  client: DbClient
  /** Permitem injetar implementações alternativas (testes). Padrão: Supabase. */
  scheduleService?: ScheduleService
  vocabularyService?: VocabularyService
  lessonService?: LessonService
  progressService?: ProgressService
  musicService?: MusicService
  children: ReactNode
}) {
  const schedule = useMemo(() => scheduleService ?? createSupabaseScheduleService(client), [client, scheduleService])
  const lessons = useMemo(() => lessonService ?? createSupabaseLessonService(client), [client, lessonService])
  const progress = useMemo(() => progressService ?? createSupabaseProgressService(client), [client, progressService])
  const music = useMemo(() => musicService ?? createSupabaseMusicService(client), [client, musicService])
  const vocabulary = useMemo(() => vocabularyService ?? createSupabaseVocabularyService(client), [client, vocabularyService])

  return (
    <SupabaseContext.Provider value={client}>
      <ScheduleServiceContext.Provider value={schedule}>
        <VocabularyServiceContext.Provider value={vocabulary}>
          <LessonServiceContext.Provider value={lessons}>
            <ProgressServiceContext.Provider value={progress}>
              <MusicServiceContext.Provider value={music}>
                <AuthProvider client={client}>{children}</AuthProvider>
              </MusicServiceContext.Provider>
            </ProgressServiceContext.Provider>
          </LessonServiceContext.Provider>
        </VocabularyServiceContext.Provider>
      </ScheduleServiceContext.Provider>
    </SupabaseContext.Provider>
  )
}
