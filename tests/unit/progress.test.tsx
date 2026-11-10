import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { AppProviders } from '../../src/app/providers'
import { routes } from '../../src/app/router'
import type { RawProgressData } from '../../src/features/progress/progress-model'
import type { ProgressService } from '../../src/features/progress/progress-service'
import { createFakeSupabase, makeSession } from '../helpers/fake-supabase'

const EMPTY: RawProgressData = { sessions: [], activities: [], lessons: [], vocabularyCreatedAt: [], reviewedAt: [] }

const DATA: RawProgressData = {
  sessions: [{ actual_minutes: 90, is_completed: true, completed_at: '2026-11-09T15:00:00Z', activity_id: 'a1' }],
  activities: [
    { id: 'a1', study_day: '2026-11-09', planned_minutes: 60 },
    { id: 'a2', study_day: '2026-11-10', planned_minutes: 30 },
  ],
  lessons: [
    {
      id: 'lesson-1',
      lesson_number: 1,
      title: 'Greetings',
      studied_on: '2026-11-03',
      status: 'completed',
      difficulties: 'Pronúncia do th',
      recommendations: null,
      lesson_blocks: [
        { block_type: 'grammar', score: 7 },
        { block_type: 'speaking', score: 6 },
      ],
    },
    {
      id: 'lesson-2',
      lesson_number: 2,
      title: 'Past simple',
      studied_on: '2026-11-08',
      status: 'completed',
      difficulties: null,
      recommendations: 'Revisar verbos irregulares',
      lesson_blocks: [{ block_type: 'grammar', score: 9 }],
    },
  ],
  vocabularyCreatedAt: ['2026-11-08T12:00:00Z'],
  reviewedAt: ['2026-11-10T12:00:00Z'],
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-10T15:00:00Z'))
})
afterEach(() => vi.useRealTimers())

function setup(raw: RawProgressData | 'error', path = '/progress') {
  const calls: (Date | null)[] = []
  let fail = raw === 'error'
  const service: ProgressService = {
    async load(from) {
      calls.push(from)
      if (fail) throw new Error('boom')
      return raw === 'error' ? EMPTY : raw
    },
  }
  const { client } = createFakeSupabase({ session: makeSession() })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AppProviders client={client} progressService={service}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { calls, router, user: userEvent.setup(), recover: () => (fail = false) }
}

const tile = (label: string) => within(screen.getByLabelText('Resumo do período')).getByText(label).closest('div')!

describe('/progress', () => {
  it('estado vazio: zeros reais e mensagens claras em cada seção', async () => {
    setup(EMPTY)
    await screen.findByLabelText('Resumo do período')
    expect(tile('Aulas concluídas')).toHaveTextContent('0')
    expect(tile('Horas estudadas')).toHaveTextContent('0 min')
    expect(screen.getByText(/Nenhuma atividade planejada neste período/)).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma aula concluída com notas neste período/)).toBeInTheDocument()
    expect(screen.getByText(/Ainda não há blocos com nota/)).toBeInTheDocument()
    expect(screen.getByText(/Nenhum dia com estudo registrado/)).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma dificuldade ou recomendação/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /Nota geral por aula/ })).not.toBeInTheDocument()
  })

  it('período padrão 30 dias; trocar de período refaz a consulta a partir do dia certo', async () => {
    const { calls, user, router } = setup(EMPTY)
    await screen.findByText(/Período: 12\/10\/2026 – 10\/11\/2026/)
    expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true')
    // início de 12/10 em Cuiabá (04:00Z) menos 1 dia de folga
    expect(calls[0]?.toISOString()).toBe('2026-10-11T04:00:00.000Z')

    await user.click(screen.getByRole('button', { name: '7 dias' }))
    await screen.findByText(/Período: 04\/11\/2026 – 10\/11\/2026/)
    expect(router.state.location.search).toBe('?period=7d')
    await user.click(screen.getByRole('button', { name: 'Todo o período' }))
    await waitFor(() => expect(calls.at(-1)).toBeNull())
  })

  it('mostra os indicadores reais, o gráfico de notas com tabela e as habilidades', async () => {
    setup(DATA)
    await screen.findByLabelText('Resumo do período')
    expect(tile('Aulas concluídas')).toHaveTextContent('2')
    expect(tile('Horas estudadas')).toHaveTextContent('1 h 30 min')
    expect(tile('Revisões de vocabulário')).toHaveTextContent('1')

    expect(screen.getByText('Planejadas').closest('div')).toHaveTextContent('2')
    expect(screen.getByText('Realizadas').closest('div')).toHaveTextContent('1')
    expect(screen.getByText('Taxa de realização').closest('div')).toHaveTextContent('50%')

    const chart = screen.getByRole('group', { name: /Nota geral por aula concluída.*2 aulas; última: 9,0/ })
    expect(within(chart).getByRole('button', { name: /Aula 1 — Greetings · 03\/11\/2026 · nota 6,5/ })).toBeInTheDocument()
    const table = screen.getAllByRole('table')[0]
    expect(within(table).getByText('Past simple', { exact: false })).toBeInTheDocument()

    const skills = within(screen.getByRole('list', { name: 'Média por habilidade (0 a 10)' }))
    expect(skills.getByText('Grammar').closest('li')).toHaveTextContent('8,0')
    expect(skills.getByText('Speaking').closest('li')).toHaveTextContent('6,0')
    expect(skills.getByText('Writing').closest('li')).toHaveTextContent('sem notas')
  })

  it('foco no ponto do gráfico mostra a leitura (teclado)', async () => {
    const { user } = setup(DATA)
    const point = await screen.findByRole('button', { name: /Aula 2 — Past simple/ })
    point.focus()
    expect(await screen.findByText(/Aula 2 — Past simple · 08\/11\/2026 · nota 9,0/, { selector: 'p' })).toBeInTheDocument()
    await user.tab()
  })

  it('dificuldades e recomendações com link para a aula de origem', async () => {
    setup(DATA)
    const link = await screen.findByRole('link', { name: 'Aula 2 — Past simple' })
    expect(link).toHaveAttribute('href', '/lessons/lesson-2')
    expect(screen.getByText('Revisar verbos irregulares')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Aula 1 — Greetings' })).toHaveAttribute('href', '/lessons/lesson-1')
  })

  it('falha ao carregar mostra erro (não zeros) e permite tentar de novo', async () => {
    const { user, recover } = setup('error')
    expect(await screen.findByText(/Não foi possível carregar o progresso/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Resumo do período')).not.toBeInTheDocument()
    recover()
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByLabelText('Resumo do período')).toBeInTheDocument()
  })
})
