import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createFakeSupabase, makeSession } from '../helpers/fake-supabase'
import { createFakeLessonService } from '../helpers/fake-lessons'
import { renderApp } from '../helpers/render-app'

function setup(path = '/lessons') {
  const fake = createFakeLessonService()
  const { client } = createFakeSupabase({ session: makeSession() })
  const user = userEvent.setup()
  const app = renderApp(client, path, undefined, undefined, fake.service)
  return { fake, user, ...app }
}

async function createLesson(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByRole('button', { name: 'Nova aula' }))
  const dialog = await screen.findByRole('dialog', { name: 'Nova aula' })
  await user.type(within(dialog).getByLabelText('Título'), title)
  await user.type(within(dialog).getByLabelText(/Assuntos estudados/), 'Past simple, irregular verbs')
  await user.click(within(dialog).getByRole('button', { name: 'Criar aula' }))
  await screen.findByRole('heading', { level: 1, name: new RegExp(title) })
}

describe('/lessons', () => {
  it('estado vazio sem aulas inventadas', async () => {
    setup()
    expect(await screen.findByText(/Nenhuma aula registrada ainda/)).toBeInTheDocument()
  })

  it('erro ao carregar mostra erro, não lista vazia', async () => {
    const fake = createFakeLessonService()
    fake.failOn('list')
    const { client } = createFakeSupabase({ session: makeSession() })
    renderApp(client, '/lessons', undefined, undefined, fake.service)
    expect(await screen.findByText(/Não foi possível carregar as aulas/)).toBeInTheDocument()
    expect(screen.queryByText(/Nenhuma aula registrada/)).not.toBeInTheDocument()
  })

  it('nova aula: validação, número sugerido, nível do perfil e navegação para o detalhe', async () => {
    const { fake, user, router } = setup()
    await user.click(await screen.findByRole('button', { name: 'Nova aula' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova aula' })
    expect(within(dialog).getByLabelText('Número')).toHaveValue(1)
    expect(within(dialog).getByLabelText('Nível')).toHaveValue('A1') // current_level do perfil
    expect(within(dialog).getByLabelText('Título')).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Criar aula' }))
    expect(within(dialog).getByText('Informe o título da aula.')).toBeInTheDocument()
    expect(fake.calls.create).toBeUndefined()

    await user.type(within(dialog).getByLabelText('Título'), 'Simple past')
    await user.click(within(dialog).getByRole('button', { name: 'Criar aula' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Aula 1 — Simple past' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/lessons/${fake.lessons[0].id}`)
    expect(fake.lessons[0]).toMatchObject({ lesson_number: 1, level: 'A1', status: 'in_progress' })
  })

  it('número repetido mostra erro compreensível', async () => {
    const { fake, user } = setup()
    await fake.service.create('u', { lesson_number: 1, title: 'x', studied_on: '2026-11-10', level: 'A1', topics: [], report: null })
    await user.click(await screen.findByRole('button', { name: 'Nova aula' }))
    const dialog = await screen.findByRole('dialog')
    const num = within(dialog).getByLabelText('Número')
    await user.clear(num)
    await user.type(num, '1')
    await user.type(within(dialog).getByLabelText('Título'), 'dup')
    await user.click(within(dialog).getByRole('button', { name: 'Criar aula' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Já existe uma aula com este número.')
  })

  it('blocos, nota por bloco, nota geral e exercícios', async () => {
    const { fake, user } = setup()
    await createLesson(user, 'Past simple')

    await user.selectOptions(screen.getByLabelText('Tipo de bloco'), 'grammar')
    await user.click(screen.getByRole('button', { name: 'Adicionar bloco' }))
    await screen.findByRole('region', { name: 'Bloco Gramática' })
    await user.selectOptions(screen.getByLabelText('Tipo de bloco'), 'listening')
    await user.click(screen.getByRole('button', { name: 'Adicionar bloco' }))
    await screen.findByRole('region', { name: 'Bloco Listening' })
    expect(within(screen.getByLabelText('Tipo de bloco')).queryByRole('option', { name: 'Gramática' })).not.toBeInTheDocument()

    // nota inválida → erro; válida com vírgula
    await user.click(screen.getByRole('button', { name: 'Nota e observações do bloco Gramática' }))
    let dialog = await screen.findByRole('dialog', { name: 'Bloco: Gramática' })
    await user.type(within(dialog).getByLabelText(/Nota do bloco/), '11')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(within(dialog).getByText(/número de 0 a 10/)).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText(/Nota do bloco/))
    await user.type(within(dialog).getByLabelText(/Nota do bloco/), '7,5')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Nota e observações do bloco Listening' }))
    dialog = await screen.findByRole('dialog', { name: 'Bloco: Listening' })
    await user.type(within(dialog).getByLabelText(/Nota do bloco/), '8')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.getByLabelText('Nota geral: 7,8')).toBeInTheDocument()) // (7,5 + 8) / 2 = 7,75 → 7,8

    // exercício
    await user.click(screen.getByRole('button', { name: 'Adicionar exercício em Gramática' }))
    dialog = await screen.findByRole('dialog', { name: 'Novo exercício' })
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(within(dialog).getByText('Informe o enunciado.')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Enunciado'), 'She ___ (go) to school yesterday.')
    await user.type(within(dialog).getByLabelText(/Minha resposta/), 'goed')
    await user.type(within(dialog).getByLabelText(/Resposta corrigida/), 'went')
    await user.type(within(dialog).getByLabelText(/Explicação/), 'Go é irregular: went.')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const list = screen.getByRole('list', { name: 'Exercícios de Gramática' })
    expect(within(list).getByText('went')).toBeInTheDocument()
    expect(fake.lessons[0].lesson_blocks[0].lesson_exercises).toHaveLength(1)

    // excluir exercício exige confirmação
    await user.click(screen.getByRole('button', { name: 'Excluir exercício 1 de Gramática' }))
    dialog = await screen.findByRole('dialog', { name: 'Excluir exercício?' })
    expect(fake.calls.removeExercise).toBeUndefined()
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))
    await screen.findByText('Exercício excluído.')
    expect(fake.lessons[0].lesson_blocks[0].lesson_exercises).toHaveLength(0)
  })

  it('dificuldades/recomendações, concluir, continuar e reabrir', async () => {
    const { fake, user, router } = setup()
    await createLesson(user, 'Greetings')
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Dificuldades e recomendações' })
    await user.type(within(dialog).getByLabelText('Dificuldades identificadas'), 'Pronúncia do "th".')
    await user.type(within(dialog).getByLabelText('Recomendações para estudos futuros'), 'Praticar minimal pairs.')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await screen.findByText('Pronúncia do "th".')
    expect(fake.lessons[0]).toMatchObject({ difficulties: 'Pronúncia do "th".', recommendations: 'Praticar minimal pairs.' })

    // em andamento aparece com "Continuar" na lista
    await router.navigate('/lessons')
    const cta = await screen.findByRole('link', { name: 'Continuar aula 1' })
    await user.click(cta)
    await user.click(await screen.findByRole('button', { name: 'Marcar como concluída' }))
    await screen.findByRole('button', { name: 'Reabrir aula' })
    expect(fake.lessons[0].status).toBe('completed')
    await router.navigate('/lessons')
    await screen.findByRole('heading', { name: 'Histórico' })
    expect(screen.queryByRole('link', { name: /Continuar/ })).not.toBeInTheDocument()
    expect(screen.getByText('1 aula · 1 concluída')).toBeInTheDocument()
  })

  it('excluir aula pede confirmação e volta para a lista', async () => {
    const { fake, user, router } = setup()
    await createLesson(user, 'Temp')
    await user.click(screen.getByRole('button', { name: 'Excluir aula' }))
    const dialog = await screen.findByRole('dialog', { name: 'Excluir aula?' })
    expect(fake.calls.remove).toBeUndefined()
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/lessons'))
    expect(await screen.findByText(/Nenhuma aula registrada ainda/)).toBeInTheDocument()
  })

  it('aula inexistente mostra mensagem e link de volta', async () => {
    setup('/lessons/00000000-0000-4000-8000-00000000ffff')
    expect(await screen.findByText('Aula não encontrada.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar às aulas' })).toHaveAttribute('href', '/lessons')
  })
})
