import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { AppProviders } from '../../src/app/providers'
import { routes } from '../../src/app/router'
import type { DbClient } from '../../src/lib/supabase-context'
import type { ScheduleService } from '../../src/features/schedule/schedule-service'
import type { VocabularyService } from '../../src/features/vocabulary/vocabulary-service'
import type { LessonService } from '../../src/features/lessons/lesson-service'
import type { MusicService } from '../../src/features/music/music-service'

export function renderApp(
  client: DbClient,
  initialPath: string,
  scheduleService?: ScheduleService,
  vocabularyService?: VocabularyService,
  lessonService?: LessonService,
  musicService?: MusicService,
) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  const utils = render(
    <AppProviders client={client} scheduleService={scheduleService} vocabularyService={vocabularyService} lessonService={lessonService} musicService={musicService}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { ...utils, router }
}
