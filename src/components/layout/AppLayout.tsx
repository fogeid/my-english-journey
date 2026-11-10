import { useEffect, useId, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { GraduationCap, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../../features/auth/auth-context'
import { ErrorState } from '../ui/ErrorState'
import { NAV_ITEMS } from './nav-items'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${focusRing} ${
                isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-100'
              }`
            }
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

function Brand() {
  return (
    <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
      <GraduationCap className="size-6 shrink-0 text-indigo-600" aria-hidden="true" />
      <span className="truncate">My English Journey</span>
    </span>
  )
}

export function AppLayout() {
  const { user, profile, profileStatus, signOut, reloadProfile } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const menuId = useId()
  const location = useLocation()

  // O menu mobile fica aberto apenas na rota em que foi aberto (fecha ao navegar) e fecha com Escape.
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null)
  const menuOpen = menuOpenAt === location.pathname
  const setMenuOpen = (open: boolean) => setMenuOpenAt(open ? location.pathname : null)
  useEffect(() => {
    if (menuOpenAt === null) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpenAt(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpenAt])

  const displayName = profile?.display_name?.trim() || user?.email || ''

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut()
  }

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Pular para o conteúdo
      </a>

      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex h-16 items-center px-4">
          <Brand />
        </div>
        <nav aria-label="Navegação principal" className="flex-1 px-3 py-2">
          <NavList />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              className={`-ml-1 rounded-md p-2 text-slate-700 hover:bg-slate-100 md:hidden ${focusRing}`}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            </button>
            <div className="min-w-0 md:hidden">
              <Brand />
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-3">
              <span className="hidden min-w-0 truncate text-sm text-slate-600 sm:block" title={displayName}>
                {displayName}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 ${focusRing}`}
              >
                <LogOut className="size-4" aria-hidden="true" />
                {signingOut ? 'Saindo…' : 'Sair'}
              </button>
            </div>
          </div>

          {/* Navegação mobile */}
          {menuOpen && (
            <nav id={menuId} aria-label="Navegação principal" className="border-t border-slate-200 px-3 py-2 md:hidden">
              <p className="truncate px-3 pb-2 text-sm text-slate-600 sm:hidden">{displayName}</p>
              <NavList onNavigate={() => setMenuOpen(false)} />
            </nav>
          )}
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 focus:outline-none sm:px-6">
          {profileStatus === 'error' && (
            <div className="mb-6">
              <ErrorState message="Não foi possível carregar seu perfil." onRetry={reloadProfile} />
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
