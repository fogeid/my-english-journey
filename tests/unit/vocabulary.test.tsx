import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createFakeSupabase, makeSession } from '../helpers/fake-supabase'
import { createFakeVocabularyService } from '../helpers/fake-vocabulary'
import { renderApp } from '../helpers/render-app'

function setup(seed: Parameters<typeof createFakeVocabularyService>[0] = []) {
  const fake = createFakeVocabularyService(seed)
  const { client } = createFakeSupabase({ session: makeSession() })
  const user = userEvent.setup()
  renderApp(client, '/vocabulary', undefined, fake.service)
  return { fake, user }
}

async function fillForm(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, v: { word: string; translation: string; e1: string; e2: string }) {
  await user.type(within(dialog).getByLabelText(/Palavra ou expressão/), v.word)
  await user.type(within(dialog).getByLabelText(/Tradução/), v.translation)
  await user.type(within(dialog).getByLabelText(/Exemplo 1/), v.e1)
  await user.type(within(dialog).getByLabelText(/Exemplo 2/), v.e2)
}

describe('/vocabulary', () => {
  it('4. estado vazio com contador real e nenhuma palavra inventada', async () => {
    setup()
    expect(await screen.findByText(/Nenhuma palavra cadastrada ainda/)).toBeInTheDocument()
    expect(await screen.findByText('0 palavras cadastradas')).toBeInTheDocument()
  })

  it('2/5. cadastro com validação inline e foco no primeiro campo', async () => {
    const { fake, user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Adicionar palavra' }))
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar palavra' })
    expect(within(dialog).getByLabelText(/Palavra ou expressão/)).toHaveFocus()

    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(within(dialog).getByText('Informe a palavra ou expressão.')).toBeInTheDocument()
    expect(within(dialog).getByText('Informe a tradução.')).toBeInTheDocument()
    expect(within(dialog).queryByText(/Informe o exemplo/)).not.toBeInTheDocument() // exemplos opcionais (ET-008)
    expect(fake.calls.create).toBeUndefined()

    await fillForm(user, dialog, { word: '  tired ', translation: 'cansado', e1: 'I am tired.', e2: 'You look tired.' })
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(fake.calls.create[0][0]).toMatchObject({ word: 'tired', source_type: 'manual' })
    expect(await screen.findByRole('heading', { name: 'tired' })).toBeInTheDocument()
    expect(screen.getByText('1 palavra cadastrada')).toBeInTheDocument()
    expect(screen.getByText(/Nova · sem revisão/)).toBeInTheDocument()
  })

  it('2. duplicata mostra erro compreensível e mantém o formulário aberto', async () => {
    const { user } = setup([{ word: 'Tired' }])
    await user.click(await screen.findByRole('button', { name: 'Adicionar palavra' }))
    const dialog = await screen.findByRole('dialog')
    await fillForm(user, dialog, { word: 'tired', translation: 'x', e1: 'a', e2: 'b' })
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/já está cadastrada/)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('2. edição preserva o agendamento (não envia campos de revisão)', async () => {
    const { fake, user } = setup([{ word: 'happy', translation: 'feliz', next_review_at: '2026-11-20T00:00:00Z', review_count: 2 }])
    await user.click(await screen.findByRole('button', { name: 'Editar “happy”' }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar palavra' })
    const tr = within(dialog).getByLabelText(/Tradução/)
    await user.clear(tr)
    await user.type(tr, 'contente')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const sent = fake.calls.update[0][1] as Record<string, unknown>
    expect(sent).not.toHaveProperty('next_review_at')
    expect(sent).not.toHaveProperty('review_count')
    expect(fake.words[0]).toMatchObject({ translation: 'contente', next_review_at: '2026-11-20T00:00:00Z', review_count: 2 })
  })

  it('2. busca e filtros consultam o serviço com os parâmetros corretos', async () => {
    const { fake, user } = setup([
      { word: 'apple', translation: 'maçã' },
      { word: 'tired', translation: 'cansado', next_review_at: '2026-11-09T00:00:00Z', review_count: 1 },
      { word: 'happy', translation: 'feliz', next_review_at: '2026-12-01T00:00:00Z', review_count: 1 },
    ])
    await screen.findByRole('heading', { name: 'apple' })
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['apple', 'happy', 'tired'])

    await user.type(screen.getByLabelText('Buscar por palavra ou tradução'), 'cans')
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['tired']))

    await user.clear(screen.getByLabelText('Buscar por palavra ou tradução'))
    await user.click(screen.getByRole('button', { name: 'Sem revisão' }))
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['apple']))
    expect(screen.getByRole('button', { name: 'Sem revisão' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Pendentes' }))
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['tired']))
    expect(fake.calls.list.at(-1)?.[0]).toMatchObject({ filter: 'due', search: '' })
  })

  it('16. exclusão: sem histórico com confirmação; com histórico bloqueada e explicada', async () => {
    const { fake, user } = setup([{ word: 'apple' }, { word: 'tired', review_count: 3, next_review_at: '2026-12-01T00:00:00Z' }])
    const locked = await screen.findByRole('button', { name: 'Excluir “tired”' })
    expect(locked).toBeDisabled()
    expect(locked).toHaveAccessibleDescription(/possui revisões registradas/)

    await user.click(screen.getByRole('button', { name: 'Excluir “apple”' }))
    const dialog = await screen.findByRole('dialog', { name: 'Excluir palavra?' })
    expect(fake.calls.remove).toBeUndefined()
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'apple' })).not.toBeInTheDocument())
    expect(fake.words.map((w) => w.word)).toEqual(['tired'])
  })

  it('4. erro de consulta mostra erro (não estado vazio) e permite tentar de novo', async () => {
    const fake = createFakeVocabularyService([{ word: 'apple' }])
    fake.failOn('list')
    const { client } = createFakeSupabase({ session: makeSession() })
    const user = userEvent.setup()
    renderApp(client, '/vocabulary', undefined, fake.service)
    expect(await screen.findByText(/Não foi possível carregar o vocabulário/)).toBeInTheDocument()
    expect(screen.queryByText(/Nenhuma palavra cadastrada/)).not.toBeInTheDocument()
    fake.recover('list')
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('heading', { name: 'apple' })).toBeInTheDocument()
  })
})
