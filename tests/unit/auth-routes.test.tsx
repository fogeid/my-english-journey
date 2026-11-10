import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createFakeSupabase, makeSession, type FakeStorage } from '../helpers/fake-supabase'
import { renderApp } from '../helpers/render-app'

const CREDS = { email: 'aluno@example.test', password: 'senha-correta-123' }

describe('Rotas e autenticação', () => {
  it('1. visitante em /dashboard é redirecionado para /login', async () => {
    const { client } = createFakeSupabase({ session: null })
    const { router } = renderApp(client, '/dashboard')

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByRole('heading', { name: 'Painel' })).not.toBeInTheDocument()
  })

  it('visitante em qualquer rota privada vai para /login', async () => {
    for (const path of ['/schedule', '/lessons', '/vocabulary', '/reviews', '/music', '/progress']) {
      const { client } = createFakeSupabase({ session: null })
      const { router, unmount } = renderApp(client, path)
      await screen.findByRole('button', { name: 'Entrar' })
      expect(router.state.location.pathname).toBe('/login')
      unmount()
    }
  })

  it('2. usuário autenticado acessa /dashboard (login real pelo formulário)', async () => {
    const user = userEvent.setup()
    const { client, calls } = createFakeSupabase({ session: null }, { credentials: CREDS })
    const { router } = renderApp(client, '/dashboard')

    await user.type(await screen.findByLabelText('E-mail'), CREDS.email)
    await user.type(screen.getByLabelText('Senha'), CREDS.password)
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: 'Painel' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard')
    await waitFor(() => expect(calls.rpc).toBeGreaterThanOrEqual(1))
  })

  it('3. logout elimina o acesso à rota privada', async () => {
    const user = userEvent.setup()
    const storage: FakeStorage = { session: makeSession() }
    const { client, calls } = createFakeSupabase(storage)
    const { router } = renderApp(client, '/dashboard')

    await screen.findByRole('heading', { name: 'Painel' })
    await user.click(screen.getByRole('button', { name: 'Sair' }))

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(calls.signOut).toBe(1)
    expect(storage.session).toBeNull()

    await router.navigate('/lessons')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(screen.queryByRole('heading', { name: 'Aulas' })).not.toBeInTheDocument()
  })

  it('4. reload preserva a sessão válida', async () => {
    const storage: FakeStorage = { session: null }
    const first = createFakeSupabase(storage, { credentials: CREDS })
    const user = userEvent.setup()
    const app1 = renderApp(first.client, '/login')
    await user.type(await screen.findByLabelText('E-mail'), CREDS.email)
    await user.type(screen.getByLabelText('Senha'), CREDS.password)
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByRole('heading', { name: 'Painel' })
    app1.unmount()

    // "Reload": nova instância do app e do cliente lendo o mesmo storage persistido.
    expect(storage.session).not.toBeNull()
    const second = createFakeSupabase(storage)
    const app2 = renderApp(second.client, '/vocabulary')
    expect(await screen.findByRole('heading', { name: 'Vocabulário' })).toBeInTheDocument()
    expect(app2.router.state.location.pathname).toBe('/vocabulary')
  })

  it('5. erro de credenciais exibe mensagem genérica, sem detalhes do servidor', async () => {
    const user = userEvent.setup()
    const raw = 'Invalid login credentials (user aluno@example.test exists; db=auth.users)'
    const { client } = createFakeSupabase({ session: null }, { credentials: CREDS, rawAuthErrorMessage: raw })
    const { router } = renderApp(client, '/login')

    await user.type(await screen.findByLabelText('E-mail'), CREDS.email)
    await user.type(screen.getByLabelText('Senha'), 'senha-errada')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('E-mail ou senha inválidos.')
    expect(document.body).not.toHaveTextContent(/Invalid login credentials|auth\.users|exists/)
    expect(router.state.location.pathname).toBe('/login')
  })

  it('/ redireciona para /login sem sessão e para /dashboard com sessão', async () => {
    const anon = createFakeSupabase({ session: null })
    const a = renderApp(anon.client, '/')
    await screen.findByRole('button', { name: 'Entrar' })
    expect(a.router.state.location.pathname).toBe('/login')
    a.unmount()

    const authed = createFakeSupabase({ session: makeSession() })
    const b = renderApp(authed.client, '/')
    await screen.findByRole('heading', { name: 'Painel' })
    expect(b.router.state.location.pathname).toBe('/dashboard')
  })

  it('usuário autenticado em /login é enviado ao /dashboard', async () => {
    const { client } = createFakeSupabase({ session: makeSession() })
    const { router } = renderApp(client, '/login')
    await screen.findByRole('heading', { name: 'Painel' })
    expect(router.state.location.pathname).toBe('/dashboard')
  })

  it('rota inexistente exibe 404', async () => {
    const { client } = createFakeSupabase({ session: makeSession() })
    renderApp(client, '/rota-que-nao-existe')
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument()
  })

  it('a página de login não oferece cadastro', async () => {
    const { client } = createFakeSupabase({ session: null })
    renderApp(client, '/login')
    await screen.findByRole('button', { name: 'Entrar' })
    expect(screen.queryByRole('link', { name: /cadastr|criar conta|sign up/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cadastr|criar conta|sign up/i })).not.toBeInTheDocument()
  })

  it('listener de autenticação é removido ao desmontar (cleanup)', async () => {
    const { client, calls } = createFakeSupabase({ session: null })
    const { unmount } = renderApp(client, '/login')
    await screen.findByRole('button', { name: 'Entrar' })
    unmount()
    expect(calls.unsubscribe).toBe(1)
  })
})
