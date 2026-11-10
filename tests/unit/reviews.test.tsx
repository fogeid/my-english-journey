import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createFakeSupabase, makeSession } from '../helpers/fake-supabase'
import { createFakeVocabularyService } from '../helpers/fake-vocabulary'
import { renderApp } from '../helpers/render-app'

function setup(seed: Parameters<typeof createFakeVocabularyService>[0]) {
  const fake = createFakeVocabularyService(seed)
  const { client } = createFakeSupabase({ session: makeSession() })
  const user = userEvent.setup()
  renderApp(client, '/reviews', undefined, fake.service)
  return { fake, user }
}

const WORDS = [
  { word: 'apple', translation: 'maçã', example_1: 'An apple a day.', example_2: 'Red apple.' },
  { word: 'tired', translation: 'cansado', example_1: 'I am tired.', example_2: 'So tired.' },
]

describe('/reviews', () => {
  it('4. fila vazia: estado de conclusão e link para o vocabulário', async () => {
    setup([])
    expect(await screen.findByText('Nenhuma revisão pendente agora.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar ao vocabulário' })).toHaveAttribute('href', '/vocabulary')
  })

  it('3. frente mostra só o termo; avaliação só aparece após revelar', async () => {
    const { user } = setup(WORDS)
    const card = await screen.findByRole('article')
    expect(within(card).getByRole('heading', { name: 'apple' })).toBeInTheDocument()
    expect(within(card).queryByText('maçã')).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /Bom/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mostrar resposta' })).toHaveFocus()

    await user.keyboard('3') // atalho antes de revelar não faz nada
    expect(within(card).queryByText('maçã')).not.toBeInTheDocument()

    await user.keyboard('{Enter}') // botão focado
    expect(within(card).getByText('maçã')).toBeInTheDocument()
    expect(within(card).getByText(/An apple a day/)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /Errei.*10 min/ })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /Bom.*1 dia/ })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /Fácil.*3 dias/ })).toBeInTheDocument()
  })

  it('avaliar salva, avança para o próximo cartão e conta a sessão', async () => {
    const { fake, user } = setup(WORDS)
    await user.click(await screen.findByRole('button', { name: 'Mostrar resposta' }))
    await user.click(screen.getByRole('button', { name: /Bom/ }))
    expect(await screen.findByRole('heading', { name: 'tired' })).toBeInTheDocument()
    expect(screen.getByText(/“apple” salva\. Próxima revisão em 1 dia/)).toBeInTheDocument()
    const summary = within(screen.getByLabelText('Resumo das revisões'))
    expect(summary.getByText('Respondidas nesta sessão:').nextElementSibling).toHaveTextContent('1')
    expect(fake.reviews).toHaveLength(1)
    expect(fake.words[0]).toMatchObject({ review_count: 1, review_streak: 1 })
  })

  it('4/20. falha ao salvar não avança o cartão; retry reutiliza o mesmo request_id', async () => {
    const { fake, user } = setup(WORDS)
    fake.failOn('review')
    await user.click(await screen.findByRole('button', { name: 'Mostrar resposta' }))
    await user.click(screen.getByRole('button', { name: /Difícil/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Nada foi salvo/)
    expect(screen.getByRole('heading', { name: 'apple' })).toBeInTheDocument()
    expect(screen.queryByText(/salva\./)).not.toBeInTheDocument()

    fake.recover('review')
    await user.click(screen.getByRole('button', { name: /Difícil/ }))
    await screen.findByRole('heading', { name: 'tired' })
    const ids = fake.calls.review.map((c) => c[2])
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
    expect(fake.reviews).toHaveLength(1)
  })

  it('5. atalhos 1–4 após revelar e fim de sessão', async () => {
    const { user } = setup(WORDS)
    await user.click(await screen.findByRole('button', { name: 'Mostrar resposta' }))
    await user.keyboard('4')
    await screen.findByRole('heading', { name: 'tired' })
    await user.click(screen.getByRole('button', { name: 'Mostrar resposta' }))
    await user.keyboard('1')
    expect(await screen.findByText('Sessão concluída: 2 palavras revisadas.')).toBeInTheDocument()
  })

  it('fila: vencidas mais antigas antes das novas', async () => {
    setup([
      { word: 'fresh', created_at: '2026-11-01T00:00:00Z' },
      { word: 'late', next_review_at: '2026-11-10T14:00:00Z', review_count: 1 },
      { word: 'older', next_review_at: '2026-11-09T00:00:00Z', review_count: 1 },
    ])
    expect(await screen.findByRole('heading', { name: 'older' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Revisão · 3 na fila/)).toBeInTheDocument())
  })
})
