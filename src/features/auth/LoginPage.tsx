import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { GraduationCap, LoaderCircle } from 'lucide-react'
import { LoadingState } from '../../components/ui/LoadingState'
import { useAuth } from './auth-context'

const PRIVATE_PREFIXES = ['/dashboard', '/schedule', '/lessons', '/vocabulary', '/reviews', '/music', '/progress']

function safeRedirect(from: unknown): string {
  if (typeof from === 'string' && PRIVATE_PREFIXES.some((p) => from === p || from.startsWith(`${p}/`))) {
    return from
  }
  return '/dashboard'
}

const inputClass =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-600 focus:outline-2 focus:outline-offset-0 focus:outline-indigo-600'

export function LoginPage() {
  const { status, signIn } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'loading') return <LoadingState label="Verificando sessão…" fullScreen />
  if (status === 'authenticated') {
    const from = (location.state as { from?: unknown } | null)?.from
    return <Navigate to={safeRedirect(from)} replace />
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    const result = await signIn(email.trim(), password)
    // Em caso de sucesso, o listener de sessão redireciona; o componente é desmontado.
    if (result.error) {
      setError(result.error)
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <GraduationCap className="size-10 text-indigo-600" aria-hidden="true" />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">My English Journey</h1>
          <p className="mt-1 text-sm text-slate-600">Entre com sua conta para continuar.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !email.trim() || !password}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            {submitting && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="text-center text-xs text-slate-500">
            Acesso restrito. Não há cadastro público.
          </p>
        </form>
      </div>
    </main>
  )
}
