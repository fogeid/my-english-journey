import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { AppProviders } from './app/providers'
import { routes } from './app/router'
import { supabase } from './lib/supabase'
import './index.css'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders client={supabase}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
