import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { createFakeSupabase, makeSession } from '../helpers/fake-supabase'
import { renderApp } from '../helpers/render-app'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Segunda 09/11/2026 03:30 UTC = domingo 08/11 23:30 em Cuiabá → semana de 02/11.
  vi.setSystemTime(new Date('2026-11-09T03:30:00Z'))
})
afterEach(() => vi.useRealTimers())

const indicators = () => within(screen.getByLabelText('Indicadores da semana'))
const value = (label: string) => indicators().getByText(label).closest('div')!.querySelector('dd')!

describe('12. Dashboard — indicadores da semana', () => {
  it('consulta a semana planejada atual no fuso de Cuiabá', async () => {
    const { client, calls } = createFakeSupabase({ session: makeSession() })
    renderApp(client, '/dashboard')
    await screen.findByLabelText('Indicadores da semana')
    expect(calls.weekSummaryArgs).toEqual([{ p_week_start: '2026-11-02' }])
    expect(screen.getByText('02/11/2026 – 08/11/2026')).toBeInTheDocument()
  })

  it('sem plano: zeros reais, 0% e legenda de ausência de plano', async () => {
    const { client } = createFakeSupabase({ session: makeSession() })
    renderApp(client, '/dashboard')
    await screen.findByLabelText('Indicadores da semana')
    expect(value('Atividades concluídas')).toHaveTextContent(/^0$/)
    expect(value('Minutos registrados')).toHaveTextContent('0 min')
    expect(value('Progresso semanal')).toHaveTextContent('0%')
    expect(indicators().getByText('Sem plano para esta semana')).toBeInTheDocument()
  })

  it('exibe somente o que o banco agregou (concluídas e minutos confirmados)', async () => {
    const { client } = createFakeSupabase(
      { session: makeSession() },
      { weekSummary: { has_plan: true, planned_count: 5, planned_minutes: 60, completed_count: 2, completed_minutes: 25 } },
    )
    renderApp(client, '/dashboard')
    await screen.findByLabelText('Indicadores da semana')
    expect(value('Atividades concluídas')).toHaveTextContent(/^2$/)
    expect(value('Minutos registrados')).toHaveTextContent('25 min')
    expect(value('Progresso semanal')).toHaveTextContent('40%')
    expect(indicators().getByText('2 de 5 atividades planejadas')).toBeInTheDocument()
  })

  it('11. falha na consulta mostra erro, não zeros; os indicadores da ET-001 continuam', async () => {
    const { client } = createFakeSupabase({ session: makeSession() }, { weekSummaryError: true })
    renderApp(client, '/dashboard')
    expect(await screen.findByText('Não foi possível carregar os indicadores da semana.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Indicadores da semana')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Contagens')).toBeInTheDocument())
  })
})
