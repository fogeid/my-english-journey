import type { RouteObject } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { NotFoundPage } from '../components/layout/NotFoundPage'
import { LoginPage } from '../features/auth/LoginPage'
import { RequireAuth, RootRedirect } from '../features/auth/route-guards'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { LessonDetailPage } from '../features/lessons/LessonDetailPage'
import { LessonsPage } from '../features/lessons/LessonsPage'
import { MusicDetailPage } from '../features/music/MusicDetailPage'
import { MusicPage } from '../features/music/MusicPage'
import { ProgressPage } from '../features/progress/ProgressPage'
import { ReviewsPage } from '../features/reviews/ReviewsPage'
import { SchedulePage } from '../features/schedule/SchedulePage'
import { VocabularyPage } from '../features/vocabulary/VocabularyPage'

export const routes: RouteObject[] = [
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/schedule', element: <SchedulePage /> },
          { path: '/lessons', element: <LessonsPage /> },
          { path: '/lessons/:lessonId', element: <LessonDetailPage /> },
          { path: '/vocabulary', element: <VocabularyPage /> },
          { path: '/reviews', element: <ReviewsPage /> },
          { path: '/music', element: <MusicPage /> },
          { path: '/music/:studyId', element: <MusicDetailPage /> },
          { path: '/progress', element: <ProgressPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]
