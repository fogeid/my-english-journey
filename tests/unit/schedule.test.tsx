import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createFakeSupabase, makeSession } from '../helpers/fake-supabase'
import { createFakeScheduleService } from '../helpers/fake-schedule'
import { renderApp } from '../helpers/render-app'

// Terça, 10/11/2026 11:00 em Cuiabá → semana atual começa em 09/11/2026.
const NOW = new Date('2026-11-10T15:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

function setup(path = '/schedule') {
  const fake = createFakeScheduleService()
  const { client } = createFakeSupabase({ session: makeSession() })
  const user = userEvent.setup()
  const app = renderApp(client, path, fake.service)
  return { fake, user, ...app }
}

const day = (name: RegExp) => screen.getByRole('region', { name })
const weekHeading = () => screen.getByRole('heading', { level: 2, name: /Semana de/ })

async function createInitialPlan(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Criar meu plano inicial' }))
  await screen.findByLabelText('Resumo da semana')
}

describe('Cronograma — navegação e estados', () => {
  it('2. Anterior / Hoje / Próxima saltam exatamente sete dias', async () => {
    const { user, router } = setup()
    await screen.findByText('Nenhum plano para esta semana.')
    expect(weekHeading()).toHaveTextContent('09/11/2026 – 15/11/2026')
    expect(screen.getByRole('button', { name: /Hoje/ })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    await waitFor(() => expect(weekHeading()).toHaveTextContent('16/11/2026 – 22/11/2026'))
    expect(router.state.location.search).toBe('?week=2026-11-16')

    await user.click(screen.getByRole('button', { name: /Anterior/ }))
    await user.click(screen.getByRole('button', { name: /Anterior/ }))
    await waitFor(() => expect(weekHeading()).toHaveTextContent('02/11/2026 – 08/11/2026'))

    await user.click(screen.getByRole('button', { name: /Hoje/ }))
    await waitFor(() => expect(weekHeading()).toHaveTextContent('09/11/2026 – 15/11/2026'))
  })

  it('normaliza ?week= para a segunda-feira e cruza a virada de ano', async () => {
    const { user } = setup('/schedule?week=2026-12-31')
    await screen.findByText('Nenhum plano para esta semana.')
    expect(weekHeading()).toHaveTextContent('28/12/2026 – 03/01/2027')
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    await waitFor(() => expect(weekHeading()).toHaveTextContent('04/01/2027 – 10/01/2027'))
  })

  it('3. semana sem plano: estado vazio, ação explícita e NADA criado por renderização', async () => {
    const { fake } = setup()
    expect(await screen.findByText('Nenhum plano para esta semana.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar meu plano inicial' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar plano vazio' })).toBeInTheDocument()
    expect(fake.plans).toHaveLength(0)
    expect(fake.calls.createInitialPlan).toBeUndefined()
    expect(fake.calls.createEmptyPlan).toBeUndefined()
  })

  it('plano inicial só é oferecido na semana atual', async () => {
    setup('/schedule?week=2026-11-16')
    await screen.findByText('Nenhum plano para esta semana.')
    expect(screen.queryByRole('button', { name: 'Criar meu plano inicial' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar plano vazio' })).toBeInTheDocument()
  })

  it('4. plano inicial cria 5 atividades na segunda (60 min) e nada nos outros dias; repetir não duplica', async () => {
    const { user, fake } = setup()
    await createInitialPlan(user)

    const monday = day(/segunda-feira/)
    const items = within(monday).getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items.map((li) => within(li).getByRole('heading').textContent)).toEqual([
      'Apresentando-se — Gramática',
      'Apresentando-se — Vocabulário',
      'Apresentando-se — Listening',
      'Apresentando-se — Speaking',
      'Apresentando-se — Revisão',
    ])
    expect(within(screen.getByLabelText('Resumo da semana')).getByText('5 atividades · 60 min')).toBeInTheDocument()

    for (const d of [/terça-feira/, /quarta-feira/, /quinta-feira/, /sexta-feira/, /sábado/, /domingo/]) {
      expect(within(day(d)).queryAllByRole('listitem')).toHaveLength(0)
      expect(within(day(d)).getByText('Nenhuma atividade neste dia.')).toBeInTheDocument()
    }

    // Segunda chamada (ex.: duplo envio): idempotente.
    await fake.service.createInitialPlan()
    expect(fake.plans).toHaveLength(1)
    expect(fake.activities).toHaveLength(5)
    expect(screen.queryByRole('button', { name: 'Criar meu plano inicial' })).not.toBeInTheDocument()
  })

  it('criar plano vazio para outra semana não copia atividades', async () => {
    const { user, fake } = setup()
    await createInitialPlan(user)
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    await user.click(await screen.findByRole('button', { name: 'Criar plano vazio' }))
    expect(await screen.findByText('Plano vazio: adicione atividades nos dias desejados.')).toBeInTheDocument()
    for (const region of screen.getAllByRole('region')) expect(within(region).queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getAllByRole('region')).toHaveLength(7)
    expect(fake.plans).toHaveLength(2)
    expect(fake.activities).toHaveLength(5)
  })
})

describe('Cronograma — CRUD e ordem', () => {
  it('5. criação com validação inline (título, categoria, minutos)', async () => {
    const { user, fake } = setup()
    await createInitialPlan(user)
    await user.click(screen.getByRole('button', { name: /Adicionar atividade em terça-feira/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova atividade' })

    // Foco inicial no primeiro campo.
    expect(within(dialog).getByLabelText('Título')).toHaveFocus()

    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(within(dialog).getByText('Informe um título.')).toBeInTheDocument()
    expect(within(dialog).getByText('Escolha uma categoria.')).toBeInTheDocument()
    expect(within(dialog).getByText(/número inteiro de 1 a 240/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Título')).toHaveAttribute('aria-invalid', 'true')
    expect(fake.calls.createActivity).toBeUndefined()

    await user.type(within(dialog).getByLabelText('Título'), 'Podcast curto')
    await user.selectOptions(within(dialog).getByLabelText('Categoria'), 'listening')
    await user.type(within(dialog).getByLabelText('Minutos previstos'), '241')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(within(dialog).getByText(/número inteiro de 1 a 240/)).toBeInTheDocument()
    expect(fake.calls.createActivity).toBeUndefined()

    await user.clear(within(dialog).getByLabelText('Minutos previstos'))
    await user.type(within(dialog).getByLabelText('Minutos previstos'), '20')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const tuesday = day(/terça-feira/)
    expect(within(tuesday).getByRole('heading', { name: 'Podcast curto' })).toBeInTheDocument()
    expect(within(tuesday).getByText('20 min previstos')).toBeInTheDocument()
    expect(screen.getByText('Atividade criada.')).toBeInTheDocument()
  })

  it('a interface oferece somente as categorias do MVP (sem writing)', async () => {
    const { user } = setup()
    await createInitialPlan(user)
    await user.click(screen.getByRole('button', { name: /Adicionar atividade em quarta-feira/ }))
    const select = within(await screen.findByRole('dialog')).getByLabelText('Categoria')
    const values = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
    expect(values).toEqual(['', 'grammar', 'vocabulary', 'listening', 'speaking', 'review', 'other'])
  })

  it('5. edição e mudança de dia na mesma semana', async () => {
    const { user, fake } = setup()
    await createInitialPlan(user)
    await user.click(screen.getByRole('button', { name: 'Editar “Apresentando-se — Speaking”' }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar atividade' })
    const title = within(dialog).getByLabelText('Título')
    await user.clear(title)
    await user.type(title, 'Speaking — gravação')
    await user.selectOptions(within(dialog).getByLabelText('Dia'), '2026-11-11')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(day(/quarta-feira/)).getByRole('heading', { name: 'Speaking — gravação' })).toBeInTheDocument()
    expect(within(day(/segunda-feira/)).getAllByRole('listitem')).toHaveLength(4)
    expect(fake.activities.find((a) => a.title === 'Speaking — gravação')?.study_day).toBe('2026-11-11')
  })

  it('5. ordem persistente com mover para cima/baixo', async () => {
    const { user, fake } = setup()
    await createInitialPlan(user)
    await user.click(screen.getByRole('button', { name: 'Mover “Apresentando-se — Gramática” para baixo' }))
    await screen.findByText('Ordem atualizada.')
    const titles = () => within(day(/segunda-feira/)).getAllByRole('listitem').map((li) => within(li).getByRole('heading').textContent)
    expect(titles().slice(0, 2)).toEqual(['Apresentando-se — Vocabulário', 'Apresentando-se — Gramática'])
    expect(screen.getByRole('button', { name: 'Mover “Apresentando-se — Vocabulário” para cima' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mover “Apresentando-se — Revisão” para baixo' })).toBeDisabled()
    expect(fake.calls.reorderDay).toHaveLength(1)
  })

  it('9. excluir atividade sem execução (com confirmação explícita)', async () => {
    const { user, fake } = setup()
    await createInitialPlan(user)
    await user.click(screen.getByRole('button', { name: 'Excluir “Apresentando-se — Revisão”' }))
    const dialog = await screen.findByRole('dialog', { name: 'Excluir atividade?' })
    expect(fake.calls.deleteActivity).toBeUndefined()
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(day(/segunda-feira/)).getAllByRole('listitem')).toHaveLength(4)
    expect(fake.activities).toHaveLength(4)
  })

  it('9. atividade executada não pode ser excluída (bloqueio explicado na UI e no serviço)', async () => {
    const { user, fake } = setup()
    await createInitialPlan(user)
    const target = fake.activities[0]
    await fake.service.completeActivity(target.id, 10)
    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    await user.click(screen.getByRole('button', { name: /Anterior/ }))

    const del = await screen.findByRole('button', { name: 'Excluir “Apresentando-se — Gramática”' })
    expect(del).toBeDisabled()
    expect(del).toHaveAccessibleDescription(/possui execução registrada/)
    await expect(fake.service.deleteActivity(target.id)).rejects.toThrow(/execução registrada/)
    expect(fake.sessions).toHaveLength(1)
  })
})

describe('Cronograma — conclusão e reabertura', () => {
  async function openComplete(user: ReturnType<typeof userEvent.setup>, title: string) {
    await user.click(screen.getByRole('button', { name: `Concluir “${title}”` }))
    return screen.findByRole('dialog', { name: 'Concluir atividade' })
  }

  it('6. minutos reais são confirmados explicitamente; cancelar não registra nada', async () => {
    const { user, fake } = setup()
    await createInitialPlan(user)
    const dialog = await openComplete(user, 'Apresentando-se — Gramática')
    const input = within(dialog).getByLabelText('Minutos realmente estudados')
    expect(input).toHaveValue(15) // sugestão = previsto
    expect(input).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(fake.calls.completeActivity).toBeUndefined()
    expect(fake.sessions).toHaveLength(0)
    // Foco volta ao botão que abriu o diálogo.
    expect(screen.getByRole('button', { name: 'Concluir “Apresentando-se — Gramática”' })).toHaveFocus()
  })

  it('6. 0 minutos é permitido e exibido como "0 min registrados"', async () => {
    const { user, fake } = setup()
    await createInitialPlan(user)
    const dialog = await openComplete(user, 'Apresentando-se — Gramática')
    const input = within(dialog).getByLabelText('Minutos realmente estudados')
    await user.clear(input)
    await user.type(input, '0')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar conclusão' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(fake.calls.completeActivity).toEqual([[fake.activities[0].id, 0]])
    expect(screen.getByText(/0 min registrados/)).toBeInTheDocument()
    const summary = within(screen.getByLabelText('Resumo da semana'))
    expect(summary.getByText('1 de 5 (20%)')).toBeInTheDocument()
    expect(summary.getByText('0 min')).toBeInTheDocument() // não usa os 15 previstos
  })

  it('6. minutos inválidos mostram erro e não registram', async () => {
    const { user, fake } = setup()
    await createInitialPlan(user)
    const dialog = await openComplete(user, 'Apresentando-se — Gramática')
    const input = within(dialog).getByLabelText('Minutos realmente estudados')
    await user.clear(input)
    await user.type(input, '481')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar conclusão' }))
    expect(within(dialog).getByText(/número inteiro de 0 a 480/)).toBeInTheDocument()
    expect(fake.calls.completeActivity).toBeUndefined()
  })

  it('7/8. concluir, reabrir e concluir de novo: uma única execução, minutos preservados na reabertura', async () => {
    const { user, fake } = setup()
    await createInitialPlan(user)
    const title = 'Apresentando-se — Vocabulário'

    let dialog = await openComplete(user, title)
    let input = within(dialog).getByLabelText('Minutos realmente estudados')
    await user.clear(input)
    await user.type(input, '12')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar conclusão' }))
    await screen.findByText(/12 min registrados/)
    expect(fake.sessions).toHaveLength(1)

    // Repetir a conclusão pelo serviço (ex.: reenvio) não duplica.
    await fake.service.completeActivity(fake.sessions[0].activity_id!, 12)
    expect(fake.sessions).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: `Reabrir “${title}”` }))
    expect(await screen.findByText(/Reaberta em .* último registro: 12 min/)).toBeInTheDocument()
    const summary = () => within(screen.getByLabelText('Resumo da semana'))
    expect(summary().getByText('0 de 5 (0%)')).toBeInTheDocument()
    expect(summary().getByText('0 min')).toBeInTheDocument()
    expect(fake.sessions).toHaveLength(1)
    expect(fake.sessions[0]).toMatchObject({ is_completed: false, actual_minutes: 12 })
    // Reaberta continua com histórico: exclusão bloqueada.
    expect(screen.getByRole('button', { name: `Excluir “${title}”` })).toBeDisabled()

    dialog = await openComplete(user, title)
    input = within(dialog).getByLabelText('Minutos realmente estudados')
    await user.clear(input)
    await user.type(input, '9')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar conclusão' }))
    await screen.findByText(/9 min registrados/)
    expect(fake.sessions).toHaveLength(1)
    expect(summary().getByText('1 de 5 (20%)')).toBeInTheDocument()
    expect(summary().getByText('9 min')).toBeInTheDocument()
  })
})

describe('Cronograma — isolamento entre semanas e falhas', () => {
  it('10. editar uma semana não altera outra', async () => {
    const { user, fake } = setup()
    await createInitialPlan(user)
    const before = JSON.stringify(fake.activities)

    await user.click(screen.getByRole('button', { name: /Próxima/ }))
    await user.click(await screen.findByRole('button', { name: 'Criar plano vazio' }))
    await user.click(await screen.findByRole('button', { name: /Adicionar atividade em segunda-feira/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Título'), 'Outra semana')
    await user.selectOptions(within(dialog).getByLabelText('Categoria'), 'other')
    await user.type(within(dialog).getByLabelText('Minutos previstos'), '5')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(JSON.stringify(fake.activities.slice(0, 5))).toBe(before)
    await user.click(screen.getByRole('button', { name: /Hoje/ }))
    await waitFor(() => expect(within(day(/segunda-feira/)).getAllByRole('listitem')).toHaveLength(5))
    expect(screen.queryByText('Outra semana')).not.toBeInTheDocument()
  })

  it('11. falha ao carregar mostra erro (não estado vazio nem zeros) e permite tentar de novo', async () => {
    const fake = createFakeScheduleService()
    fake.failOn('loadWeek')
    const { client } = createFakeSupabase({ session: makeSession() })
    const user = userEvent.setup()
    renderApp(client, '/schedule', fake.service)
    expect(await screen.findByText(/Não foi possível carregar o cronograma/)).toBeInTheDocument()
    expect(screen.queryByText('Nenhum plano para esta semana.')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Resumo da semana')).not.toBeInTheDocument()

    fake.recover('loadWeek')
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Nenhum plano para esta semana.')).toBeInTheDocument()
  })

  it('11. falha numa ação mantém o diálogo aberto, mostra erro e não mostra sucesso', async () => {
    const { user, fake } = setup()
    await createInitialPlan(user)
    fake.failOn('completeActivity')
    await user.click(screen.getByRole('button', { name: 'Concluir “Apresentando-se — Gramática”' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar conclusão' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Não foi possível salvar/)
    expect(screen.queryByText('Atividade concluída.')).not.toBeInTheDocument()
    expect(fake.sessions).toHaveLength(0)
    expect(within(screen.getByLabelText('Resumo da semana')).getByText('0 de 5 (0%)')).toBeInTheDocument()
  })

  it('11. falha ao criar plano inicial não exibe plano nem sucesso', async () => {
    const { user, fake } = setup()
    fake.failOn('createInitialPlan')
    await user.click(await screen.findByRole('button', { name: 'Criar meu plano inicial' }))
    expect(await screen.findByText(/Não foi possível salvar/)).toBeInTheDocument()
    expect(screen.getByText('Nenhum plano para esta semana.')).toBeInTheDocument()
    expect(screen.queryByText('Plano inicial criado.')).not.toBeInTheDocument()
  })
})

describe('13. Acessibilidade básica', () => {
  it('Esc fecha o diálogo e o foco volta ao gatilho; dias são regiões nomeadas', async () => {
    const { user } = setup()
    await createInitialPlan(user)
    expect(screen.getAllByRole('region')).toHaveLength(7)
    const trigger = screen.getByRole('button', { name: /Adicionar atividade em sexta-feira/ })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Nova atividade' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })
})
