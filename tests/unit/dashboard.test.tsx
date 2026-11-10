import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PlaceholderPage } from '../../src/components/ui/PlaceholderPage'
import { createFakeSupabase, makeSession } from '../helpers/fake-supabase'
import { renderApp } from '../helpers/render-app'

function statValue(label: string) {
  const term = screen.getByText(label, { selector: 'dt span' })
  const card = term.closest('div')!
  return within(card).getByRole('definition')
}

describe('Dashboard', () => {
  it('6. dashboard vazio exibe zeros reais vindos das consultas', async () => {
    const { client, calls } = createFakeSupabase({ session: makeSession() })
    renderApp(client, '/dashboard')

    await screen.findByLabelText('Contagens')
    expect(statValue('Aulas')).toHaveTextContent(/^0$/)
    expect(statValue('Estudos musicais')).toHaveTextContent(/^0$/)
    expect(statValue('Vocabulário')).toHaveTextContent(/^0$/)
    expect(statValue('Revisões pendentes')).toHaveTextContent(/^0$/)
    expect(screen.getByText(/Nenhum registro ainda/)).toBeInTheDocument()

    // Os zeros vieram de consultas reais ao cliente (não de constantes).
    // ET-003: pendentes/novas passaram a vir de get_vocabulary_summary (hora do servidor).
    // ET-004: + aulas concluídas; ET-006: + estudos musicais concluídos.
    expect(calls.countQueries.sort()).toEqual(['lessons', 'lessons_completed', 'music_studies', 'music_studies_completed', 'vocabulary', 'vocabulary_summary'])
  })

  it('exibe nível e meta diária do perfil retornado pela RPC', async () => {
    const { client } = createFakeSupabase({ session: makeSession() })
    renderApp(client, '/dashboard')
    await screen.findByText('Nível atual')
    expect(statValue('Nível atual')).toHaveTextContent('A1')
    expect(statValue('Meta diária')).toHaveTextContent('60 min')
  })

  it('reflete as contagens retornadas pelo banco', async () => {
    const { client } = createFakeSupabase(
      { session: makeSession() },
      { counts: { lessons: 3, music_studies: 1, vocabulary: 12, vocabulary_pending: 4 } },
    )
    renderApp(client, '/dashboard')
    await screen.findByLabelText('Contagens')
    expect(statValue('Aulas')).toHaveTextContent('3')
    expect(statValue('Estudos musicais')).toHaveTextContent('1')
    expect(statValue('Vocabulário')).toHaveTextContent('12')
    expect(statValue('Revisões pendentes')).toHaveTextContent('4')
    expect(screen.queryByText(/Nenhum registro ainda/)).not.toBeInTheDocument()
  })

  it('ET-003: palavras novas aparecem separadas das pendentes, com acesso a /reviews', async () => {
    const { client } = createFakeSupabase(
      { session: makeSession() },
      { counts: { vocabulary: 7, vocabulary_pending: 2, vocabulary_new: 3 } },
    )
    renderApp(client, '/dashboard')
    await screen.findByLabelText('Contagens')
    expect(statValue('Revisões pendentes')).toHaveTextContent(/^2$/) // não soma as novas
    expect(screen.getByText('Palavras novas', { selector: 'dt span' }).closest('div')!.querySelector('dd')).toHaveTextContent(/^3$/)
    expect(screen.getByRole('link', { name: 'Revisar agora (5 na fila)' })).toHaveAttribute('href', '/reviews')
  })

  it('ET-004: exibe a quantidade real de aulas concluídas', async () => {
    const { client } = createFakeSupabase({ session: makeSession() }, { counts: { lessons: 5, lessons_completed: 3 } })
    renderApp(client, '/dashboard')
    await screen.findByLabelText('Contagens')
    expect(statValue('Aulas')).toHaveTextContent(/^5$/)
    expect(statValue('Aulas concluídas')).toHaveTextContent(/^3$/)
  })

  it('ET-006: exibe a quantidade real de estudos musicais concluídos', async () => {
    const { client } = createFakeSupabase({ session: makeSession() }, { counts: { music_studies: 4, music_studies_completed: 1 } })
    renderApp(client, '/dashboard')
    await screen.findByLabelText('Contagens')
    expect(statValue('Estudos musicais')).toHaveTextContent(/^4$/)
    expect(statValue('Estudos musicais concluídos')).toHaveTextContent(/^1$/)
  })

  it('ET-007: ações do dia aparecem no topo, antes dos indicadores', async () => {
    const empty = createFakeSupabase({ session: makeSession() })
    const a = renderApp(empty.client, '/dashboard')
    const steps = await screen.findByRole('navigation', { name: 'Primeiros passos' })
    const week = screen.getByRole('heading', { name: 'Esta semana' })
    expect(steps.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(steps).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/schedule', '/lessons', '/music', '/vocabulary'])
    expect(screen.queryByText(/próximas etapas/)).not.toBeInTheDocument()
    const weekSection = screen.getByRole('region', { name: 'Esta semana' })
    expect(await within(weekSection).findByRole('link', { name: 'Cronograma' })).toHaveAttribute('href', '/schedule')
    a.unmount()

    const busy = createFakeSupabase({ session: makeSession() }, { counts: { vocabulary: 3, vocabulary_new: 3 } })
    renderApp(busy.client, '/dashboard')
    const review = await screen.findByRole('link', { name: 'Revisar agora (3 na fila)' })
    expect(review.compareDocumentPosition(screen.getByRole('heading', { name: 'Esta semana' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Primeiros passos' })).not.toBeInTheDocument()
  })

  it('falha nas contagens mostra erro, não zeros', async () => {
    const { client } = createFakeSupabase({ session: makeSession() }, { countsError: true })
    renderApp(client, '/dashboard')
    expect(await screen.findByText('Não foi possível carregar as contagens.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Contagens')).not.toBeInTheDocument()
  })

  it('falha na RPC do perfil mostra erro e não cria perfil local', async () => {
    const { client } = createFakeSupabase({ session: makeSession() }, { profileError: true })
    renderApp(client, '/dashboard')
    expect(await screen.findByText('Não foi possível carregar seu perfil.')).toBeInTheDocument()
    expect(screen.queryByText('Nível atual')).not.toBeInTheDocument()
    expect(screen.queryByText('Meta diária')).not.toBeInTheDocument()
  })

  it('páginas futuras são apenas placeholders', async () => {
    // ET-006 implementou /music: nenhuma rota usa mais o placeholder. O componente continua
    // garantindo que uma página futura mostra só título e descrição (sem formulários nem dados).
    render(<PlaceholderPage title="Futuro" description="Seção reservada." />)
    expect(await screen.findByRole('heading', { name: 'Futuro' })).toBeInTheDocument()
    expect(screen.getByText(/etapa futura/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })
})
