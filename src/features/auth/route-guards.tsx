import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingState } from '../../components/ui/LoadingState'
import { useAuth } from './auth-context'

/** Protege rotas privadas: visitante é enviado para /login (guardando a origem). */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <LoadingState label="Verificando sessão…" fullScreen />
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

/** "/" → /dashboard se autenticado, senão /login. */
export function RootRedirect() {
  const { status } = useAuth()
  if (status === 'loading') return <LoadingState label="Verificando sessão…" fullScreen />
  return <Navigate to={status === 'authenticated' ? '/dashboard' : '/login'} replace />
}
