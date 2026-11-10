/**
 * ET-007 — interface das subatividades e do gerador semanal (serviço fake em memória;
 * o contrato real do banco é verificado em tests/rls/schedule-subactivities-rls.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createFakeSupabase, makeSession } from '../helpers/fake-supabase'
import { createFakeScheduleService } from '../helpers/fake-schedule'
import { renderApp } from '../helpers/render-app'
import type { StepValues } from '../../src/features/schedule/schedule-model'

// Terça, 10/11/2026 11:00 em Cuiabá → semana atual começa em 09/11/2026.
const NOW = new Date('2026-11-10T15:00:00Z')
const WEEK = '2026-11-09'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

type Fake = ReturnType<typeof createFakeScheduleService>

const LESSON_STEPS: StepValues[] = [
  { title: 'Revisão', description: null, planned_minutes: 10 },
  { title: 'Gramática', description: 'to be', planned_minutes: 15 },
  { title: 'Speaking', description: null, planned_minutes: 5 },
]

async function seedActivity(fake: Fake, title = 'Aula 04 — Family', steps: StepValues[] = LESSON_STEPS) {
  if (!fake.plans.some((p) => p.week_start === WEEK)) await fake.service.createEmptyPlan('u', WEEK)
  const plan = fake.plans.find((p) => p.week_start === WEEK)!
  await fake.service.saveActivity({
    activityId: null,
    planId: plan.id,
    values: { title, description: null, skill: 'lesson', plannedMinutes: 1, studyDay: '2026-11-10' },
    steps,
  })
  return fake.activities[fake.activities.length - 1]
}

async function setup(seed?: (fake: Fake) => Promise<unknown>) {
  const fake = createFakeScheduleService()
  if (seed) await seed(fake)
  const { client } = createFakeSupabase({ session: makeSession() })
  const user = userEvent.setup()
  const app = renderApp(client, '/schedule', fake.service)
  return { fake, user, ...app }
}

const summary = () => within(screen.getByLabelText('Resumo da semana'))
const stepsOf = (fake: Fake, activityId: string) =>
  fake.steps.filter((s) => s.activity_id === activityId).sort((a, b) => a.position - b.position)

async function expand(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByRole('button', { name: `Expandir etapas de “${title}”` }))
  return screen.getByRole('list', { name: `Etapas de “${title}”` })
}

describe('ET-007 — criar e editar atividades com etapas', () => {
  it('1/2. cria uma aula com 6 etapas: minutos previstos = soma, campo calculado e bloqueado', async () => {
    const { user, fake } = await setup((f) => f.service.createEmptyPlan('u', WEEK))
    await user.click(await screen.findByRole('button', { name: /Adicionar atividade em terça-feira/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova atividade' })
    await user.type(within(dialog).getByLabelText('Título'), 'Aula 04 — Family')
    await user.selectOptions(within(dialog).getByLabelText('Categoria'), 'lesson')

    const plan = [10, 15, 10, 10, 10, 5]
    for (let i = 0; i < plan.length; i++) {
      await user.click(within(dialog).getByRole('button', { name: 'Adicionar subatividade' }))
      await user.type(within(dialog).getByLabelText(`Título da etapa ${i + 1}`), `Bloco ${i + 1}`)
      await user.type(within(dialog).getByLabelText(`Minutos da etapa ${i + 1}`), String(plan[i]))
    }
    expect(within(dialog).getByText('6 etapas · total 60 min')).toBeInTheDocument()
    const minutes = within(dialog).getByLabelText('Minutos previstos')
    expect(minutes).toBeDisabled()
    expect(minutes).toHaveValue(60)
    expect(within(dialog).getByText('Soma das subatividades (calculada).')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const act = fake.activities.find((a) => a.title === 'Aula 04 — Family')!
    expect(act.planned_minutes).toBe(60)
    expect(stepsOf(fake, act.id).map((s) => [s.position, s.title, s.planned_minutes, s.is_completed])).toEqual(
      plan.map((m, i) => [i + 1, `Bloco ${i + 1}`, m, false]),
    )
    // nada concluído na criação; o resumo conta a atividade principal (sem somar etapas de novo)
    expect(fake.sessions).toHaveLength(0)
    expect(summary().getByText('1 atividade · 60 min')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Expandir etapas de “Aula 04 — Family”' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('0/6 etapas')).toBeInTheDocument()
  })

  it('etapa inválida bloqueia o envio e mostra o erro na própria etapa', async () => {
    const { user, fake } = await setup((f) => f.service.createEmptyPlan('u', WEEK))
    await user.click(await screen.findByRole('button', { name: /Adicionar atividade em terça-feira/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova atividade' })
    await user.type(within(dialog).getByLabelText('Título'), 'Aula')
    await user.selectOptions(within(dialog).getByLabelText('Categoria'), 'lesson')
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar subatividade' }))
    await user.type(within(dialog).getByLabelText('Minutos da etapa 1'), '10')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(within(dialog).getByText('Informe o título da etapa.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Título da etapa 1')).toHaveAttribute('aria-invalid', 'true')
    expect(fake.calls.saveActivity).toBeUndefined()
  })

  it('3. editar: reordenar, renomear, remover e adicionar etapas preservando ids e status', async () => {
    let actId = ''
    const { user, fake } = await setup(async (f) => {
      actId = (await seedActivity(f)).id
      await f.service.setStepCompleted(f.steps[0].id, true) // "Revisão" concluída
    })
    const [revisao, gramatica, speaking] = stepsOf(fake, actId)

    await user.click(await screen.findByRole('button', { name: 'Editar “Aula 04 — Family”' }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar atividade' })
    expect(within(dialog).getByText('3 etapas · total 30 min')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Mover etapa 2 para cima' })) // Gramática, Revisão, Speaking
    await user.click(within(dialog).getByRole('button', { name: 'Remover etapa 3' })) // remove Speaking
    const t1 = within(dialog).getByLabelText('Título da etapa 1')
    await user.clear(t1)
    await user.type(t1, 'Gramática com exercícios')
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar subatividade' }))
    await user.type(within(dialog).getByLabelText('Título da etapa 3'), 'Desafio')
    await user.type(within(dialog).getByLabelText('Minutos da etapa 3'), '7')
    expect(within(dialog).getByText('3 etapas · total 32 min')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const after = stepsOf(fake, actId)
    expect(after.map((s) => [s.title, s.planned_minutes])).toEqual([
      ['Gramática com exercícios', 15],
      ['Revisão', 10],
      ['Desafio', 7],
    ])
    expect(after[0].id).toBe(gramatica.id)
    expect(after[1]).toMatchObject({ id: revisao.id, is_completed: true })
    expect(after.some((s) => s.id === speaking.id)).toBe(false)
    expect(fake.activities.find((a) => a.id === actId)!.planned_minutes).toBe(32)
  })

  it('atividade sem etapas continua como antes (sem progresso de etapas)', async () => {
    const { user } = await setup()
    await user.click(await screen.findByRole('button', { name: 'Criar meu plano inicial' }))
    await screen.findByLabelText('Resumo da semana')
    expect(screen.queryByRole('button', { name: /Expandir etapas/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})

describe('ET-007 — marcar etapas e sincronizar a atividade principal', () => {
  it('4/5. expandir, marcar e desmarcar etapas atualiza o progresso sem concluir a principal', async () => {
    let actId = ''
    const { user, fake } = await setup(async (f) => (actId = (await seedActivity(f)).id))
    const list = await expand(user, 'Aula 04 — Family')
    await user.click(within(list).getByRole('checkbox', { name: /Revisão/ }))
    await screen.findByText('1/3 etapas')
    expect(screen.getByRole('progressbar', { name: 'Progresso de “Aula 04 — Family”' })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText('33%')).toBeInTheDocument()
    expect(fake.sessions).toHaveLength(0)

    await user.click(within(screen.getByRole('list', { name: 'Etapas de “Aula 04 — Family”' })).getByRole('checkbox', { name: /Revisão/ }))
    await screen.findByText('0/3 etapas')
    expect(stepsOf(fake, actId).every((s) => !s.is_completed)).toBe(true)
  })

  it('6. a última etapa pede os minutos reais e conclui a principal; cancelar não grava nada', async () => {
    let actId = ''
    const { user, fake } = await setup(async (f) => {
      actId = (await seedActivity(f)).id
      await f.service.setStepCompleted(f.steps[0].id, true)
      await f.service.setStepCompleted(f.steps[1].id, true)
    })
    let list = await expand(user, 'Aula 04 — Family')
    await user.click(within(list).getByRole('checkbox', { name: /Speaking/ }))
    let dialog = await screen.findByRole('dialog', { name: 'Concluir última etapa' })
    expect(within(dialog).getByText(/“Speaking” é a última etapa/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(fake.sessions).toHaveLength(0)
    expect(stepsOf(fake, actId)[2].is_completed).toBe(false)

    list = screen.getByRole('list', { name: 'Etapas de “Aula 04 — Family”' })
    await user.click(within(list).getByRole('checkbox', { name: /Speaking/ }))
    dialog = await screen.findByRole('dialog', { name: 'Concluir última etapa' })
    const input = within(dialog).getByLabelText('Minutos realmente estudados')
    expect(input).toHaveValue(30) // sugestão = soma das etapas
    await user.clear(input)
    await user.type(input, '27')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar conclusão' }))
    await screen.findByText(/27 min registrados/)
    expect(fake.sessions).toHaveLength(1)
    expect(fake.sessions[0]).toMatchObject({ activity_id: actId, is_completed: true, actual_minutes: 27 })
    expect(stepsOf(fake, actId).every((s) => s.is_completed)).toBe(true)
    // dashboard/resumo: 1 atividade concluída, minutos reais (não a soma das etapas)
    expect(summary().getByText('1 de 1 (100%)')).toBeInTheDocument()
    expect(summary().getByText('27 min')).toBeInTheDocument()
  })

  it('7. desmarcar uma etapa de atividade concluída reabre a principal preservando os minutos', async () => {
    let actId = ''
    const { user, fake } = await setup(async (f) => {
      actId = (await seedActivity(f)).id
      await f.service.completeActivity(actId, 20)
    })
    const list = await expand(user, 'Aula 04 — Family')
    await user.click(within(list).getByRole('checkbox', { name: /Gramática/ }))
    expect(await screen.findByText(/Reaberta em .* último registro: 20 min/)).toBeInTheDocument()
    expect(fake.sessions[0]).toMatchObject({ is_completed: false, actual_minutes: 20 })
    expect(stepsOf(fake, actId).map((s) => s.is_completed)).toEqual([true, false, true])
    expect(summary().getByText('0 de 1 (0%)')).toBeInTheDocument()
  })

  it('8. concluir a principal marca todas as etapas; reabrir a principal deixa todas pendentes', async () => {
    let actId = ''
    const { user, fake } = await setup(async (f) => (actId = (await seedActivity(f)).id))
    await user.click(await screen.findByRole('button', { name: 'Concluir “Aula 04 — Family”' }))
    const dialog = await screen.findByRole('dialog', { name: 'Concluir atividade' })
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar conclusão' }))
    await screen.findByText('3/3 etapas')
    expect(stepsOf(fake, actId).every((s) => s.is_completed)).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Reabrir “Aula 04 — Family”' }))
    await screen.findByText('0/3 etapas')
    expect(stepsOf(fake, actId).every((s) => !s.is_completed)).toBe(true)
    expect(fake.sessions).toHaveLength(1)
  })

  it('falha ao marcar uma etapa mostra erro e não altera o progresso', async () => {
    const { user, fake } = await setup((f) => seedActivity(f))
    fake.failOn('setStepCompleted')
    const list = await expand(user, 'Aula 04 — Family')
    await user.click(within(list).getByRole('checkbox', { name: /Revisão/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível salvar/)
    expect(screen.getByText('0/3 etapas')).toBeInTheDocument()
    expect(screen.queryByText('Etapa concluída.')).not.toBeInTheDocument()
  })

  it('excluir a atividade sem histórico remove as etapas junto', async () => {
    let actId = ''
    const { user, fake } = await setup(async (f) => (actId = (await seedActivity(f)).id))
    await user.click(await screen.findByRole('button', { name: 'Excluir “Aula 04 — Family”' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Excluir/ }))
    await waitFor(() => expect(fake.activities.some((a) => a.id === actId)).toBe(false))
    expect(fake.steps.filter((s) => s.activity_id === actId)).toHaveLength(0)
  })
})

describe('ET-007 — gerador semanal', () => {
  async function openGenerator(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Gerar cronograma semanal' }))
    return screen.findByRole('dialog', { name: 'Gerar cronograma semanal' })
  }

  it('9–12. configura, mostra a prévia e só grava após confirmar; nada vem concluído', async () => {
    const { user, fake } = await setup()
    await screen.findByText('Nenhum plano para esta semana.')
    let dialog = await openGenerator(user)
    // padrões
    expect(within(dialog).getByLabelText('Data de início')).toHaveValue('2026-11-10')
    expect(within(dialog).getByLabelText('Quantidade de dias')).toHaveValue(7)
    expect(within(dialog).getByLabelText('Próxima aula nº')).toHaveValue(4)
    expect(within(dialog).getByLabelText('Próximo estudo musical nº')).toHaveValue(2)
    expect(within(dialog).getByLabelText('Duração da aula (min)')).toHaveValue(60)
    expect(within(dialog).getByLabelText('Duração do estudo musical (min)')).toHaveValue(60)

    const start = within(dialog).getByLabelText('Data de início')
    await user.clear(start)
    await user.type(start, WEEK)
    await user.click(within(dialog).getByRole('button', { name: 'Ver prévia' }))
    dialog = await screen.findByRole('dialog', { name: 'Prévia do cronograma' })
    expect(within(dialog).getByText(/22 novas · 0 já existem · 0 conflitos/)).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /Aula 04 —/ })).toBeChecked()
    expect(within(dialog).getByRole('region', { name: /Prévia de quinta-feira/ })).toHaveTextContent('Flashcards no My English Journey')
    expect(fake.activities).toHaveLength(0) // prévia não grava

    // desmarcar um item tira da gravação
    await user.click(within(dialog).getByRole('checkbox', { name: /Leitura A1/ }))
    const total = 7 * 60 + 7 * 60 + (20 + 30 + 25 + 20 + 10 + 30 + 30)
    await user.click(within(dialog).getByRole('button', { name: `Gravar 21 atividades (${total} min)` }))

    await screen.findByText(/Cronograma gerado: 21 atividades criadas/)
    expect(fake.activities).toHaveLength(21)
    expect(fake.sessions).toHaveLength(0)
    expect(fake.steps.every((s) => !s.is_completed)).toBe(true)
    expect(fake.steps).toHaveLength(7 * 6 + 7 * 5)
    expect(fake.activities.filter((a) => a.skill === 'lesson').every((a) => a.planned_minutes === 60)).toBe(true)
    expect(summary().getByText(`21 atividades · ${total} min`)).toBeInTheDocument()
  })

  it('13/14. reexecutar não duplica: itens existentes aparecem como "Já existe" e só o ausente é gravado', async () => {
    const { user, fake } = await setup()
    await screen.findByText('Nenhum plano para esta semana.')
    const run = async (uncheck?: RegExp) => {
      const d = await openGenerator(user)
      const start = within(d).getByLabelText('Data de início')
      await user.clear(start)
      await user.type(start, WEEK)
      await user.click(within(d).getByRole('button', { name: 'Ver prévia' }))
      const p = await screen.findByRole('dialog', { name: 'Prévia do cronograma' })
      if (uncheck) await user.click(within(p).getByRole('checkbox', { name: uncheck }))
      return p
    }
    let p = await run(/Leitura A1/)
    await user.click(within(p).getByRole('button', { name: /Gravar 21 atividades/ }))
    await screen.findByText(/21 atividades criadas/)

    p = await run()
    expect(within(p).getByText(/1 novas · 21 já existem · 0 conflitos/)).toBeInTheDocument()
    expect(within(p).getByText(/não serão gravados/)).toBeInTheDocument()
    expect(within(p).getByRole('checkbox', { name: /Aula 04 —/ })).toBeDisabled()
    await user.click(within(p).getByRole('button', { name: 'Gravar 1 atividade (30 min)' }))
    await screen.findByText(/Cronograma gerado: 1 atividade criada/)
    expect(fake.activities).toHaveLength(22)

    p = await run()
    expect(within(p).getByText(/0 novas · 22 já existem/)).toBeInTheDocument()
    expect(within(p).getByRole('button', { name: 'Nada novo para gravar' })).toBeDisabled()
  })

  it('15. conflito com atividade manual é mostrado e não é sobrescrito', async () => {
    const { user, fake } = await setup((f) => seedActivity(f, 'Aula 05 — minha versão', []))
    const before = fake.activities.map((a) => ({ ...a }))
    const d = await openGenerator(user)
    const start = within(d).getByLabelText('Data de início')
    await user.clear(start)
    await user.type(start, WEEK)
    await user.click(within(d).getByRole('button', { name: 'Ver prévia' }))
    const p = await screen.findByRole('dialog', { name: 'Prévia do cronograma' })
    expect(within(p).getAllByText('Conflito').length).toBeGreaterThanOrEqual(1)
    expect(within(p).getByText(/Já existe "Aula 05 — minha versão"/)).toBeInTheDocument()
    expect(within(p).getByRole('checkbox', { name: /Aula 05 —/ })).toBeDisabled()
    await user.click(within(p).getByRole('button', { name: /Gravar \d+ atividades/ }))
    await screen.findByText(/Cronograma gerado/)
    expect(fake.activities.find((a) => a.id === before[0].id)).toEqual(before[0])
    expect(fake.activities.filter((a) => /^Aula 05/.test(a.title))).toHaveLength(1)
  })

  it('16. validação da configuração impede a prévia', async () => {
    const { user, fake } = await setup()
    const d = await openGenerator(user)
    const days = within(d).getByLabelText('Quantidade de dias')
    await user.clear(days)
    await user.type(days, '20')
    await user.click(within(d).getByRole('button', { name: 'Ver prévia' }))
    expect(within(d).getByRole('alert')).toHaveTextContent('Quantidade de dias: de 1 a 14.')
    expect(fake.calls.loadGeneratorContext).toBeUndefined()
  })

  it('17. falha na gravação mostra erro, não mostra sucesso e não grava nada', async () => {
    const { user, fake } = await setup()
    fake.failOn('generate')
    const d = await openGenerator(user)
    await user.click(within(d).getByRole('button', { name: 'Ver prévia' }))
    const p = await screen.findByRole('dialog', { name: 'Prévia do cronograma' })
    await user.click(within(p).getByRole('button', { name: /Gravar/ }))
    expect(await within(p).findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/Cronograma gerado/)).not.toBeInTheDocument()
    expect(fake.activities).toHaveLength(0)
    expect(screen.getByRole('dialog', { name: 'Prévia do cronograma' })).toBeInTheDocument()
  })

  it('18. gerar a partir de outra semana navega para a semana da data de início', async () => {
    const { user, router } = await setup()
    const d = await openGenerator(user)
    const start = within(d).getByLabelText('Data de início')
    await user.clear(start)
    await user.type(start, '2026-11-16')
    const n = within(d).getByLabelText('Quantidade de dias')
    await user.clear(n)
    await user.type(n, '2')
    await user.click(within(d).getByRole('button', { name: 'Ver prévia' }))
    const p = await screen.findByRole('dialog', { name: 'Prévia do cronograma' })
    await user.click(within(p).getByRole('button', { name: /Gravar/ }))
    await waitFor(() => expect(router.state.location.search).toBe('?week=2026-11-16'))
    expect(await screen.findByText(/Cronograma gerado/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /Semana de/ })).toHaveTextContent('16/11/2026 – 22/11/2026')
  })
})
