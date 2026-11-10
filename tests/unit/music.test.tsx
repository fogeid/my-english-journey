import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createFakeSupabase, makeSession } from '../helpers/fake-supabase'
import { createFakeMusicService } from '../helpers/fake-music'
import { renderApp } from '../helpers/render-app'

function setup(path = '/music', vocab: string[] = []) {
  const fake = createFakeMusicService(vocab)
  const { client } = createFakeSupabase({ session: makeSession() })
  const user = userEvent.setup()
  const app = renderApp(client, path, undefined, undefined, undefined, fake.service)
  return { fake, user, ...app }
}

async function createStudy(user: ReturnType<typeof userEvent.setup>, song = 'Imagine', artist = 'John Lennon') {
  await user.click(await screen.findByRole('button', { name: 'Novo estudo' }))
  const d = await screen.findByRole('dialog', { name: 'Novo estudo musical' })
  await user.type(within(d).getByLabelText('Música'), song)
  await user.type(within(d).getByLabelText('Artista'), artist)
  await user.click(within(d).getByRole('button', { name: 'Criar estudo' }))
  await screen.findByRole('heading', { level: 1, name: new RegExp(song) })
}

describe('/music', () => {
  it('estado vazio e validação do novo estudo (número sugerido, nível do perfil)', async () => {
    const { fake, user } = setup()
    expect(await screen.findByText(/Nenhum estudo musical registrado ainda/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Novo estudo' }))
    const d = await screen.findByRole('dialog', { name: 'Novo estudo musical' })
    expect(within(d).getByLabelText('Número')).toHaveValue(1)
    expect(within(d).getByLabelText('Nível')).toHaveValue('A1')
    expect(within(d).getByText(/Não cole a letra completa/)).toBeInTheDocument()
    await user.click(within(d).getByRole('button', { name: 'Criar estudo' }))
    expect(within(d).getByText('Informe o nome da música.')).toBeInTheDocument()
    expect(within(d).getByText('Informe o artista.')).toBeInTheDocument()
    expect(fake.calls.create).toBeUndefined()
  })

  it('compreensão inicial e final com diferença; atividades fixas registradas', async () => {
    const { fake, user } = setup()
    await createStudy(user)
    expect(screen.getByLabelText('Diferença: —')).toBeInTheDocument()

    for (const [which, score] of [['inicial', '4'], ['final', '7,5']] as const) {
      await user.click(screen.getByRole('button', { name: `Registrar compreensão ${which}` }))
      const d = await screen.findByRole('dialog')
      await user.type(within(d).getByLabelText(/Nota \(0 a 10\)/), score)
      await user.click(within(d).getByRole('button', { name: 'Salvar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    }
    expect(screen.getByLabelText('Diferença: +3,5')).toBeInTheDocument()

    // as 5 atividades aparecem sempre, na ordem
    const acts = within(screen.getByRole('heading', { name: 'Atividades' }).parentElement!).getAllByRole('listitem')
    expect(acts.map((li) => li.getAttribute('aria-label'))).toEqual([
      'Primeira escuta e compreensão inicial',
      'Vocabulário e expressões',
      'Tradução e interpretação de trechos curtos',
      'Pronúncia e reconhecimento auditivo',
      'Escuta final e avaliação da evolução',
    ])
    await user.click(screen.getByRole('button', { name: 'Registrar atividade: Pronúncia e reconhecimento auditivo' }))
    let d = await screen.findByRole('dialog', { name: 'Pronúncia e reconhecimento auditivo' })
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    expect(within(d).getByText('Preencha ao menos um campo.')).toBeInTheDocument()
    await user.type(within(d).getByLabelText('Dificuldades'), 'Ligação entre palavras')
    await user.type(within(d).getByLabelText('Correções'), 'imagine all → "imagine-all"')
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    await screen.findByText('Ligação entre palavras')

    // editar atualiza a mesma atividade (não duplica)
    await user.click(screen.getByRole('button', { name: 'Editar atividade: Pronúncia e reconhecimento auditivo' }))
    d = await screen.findByRole('dialog')
    await user.type(within(d).getByLabelText('Observações'), 'Repetir amanhã')
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    await screen.findByText('Repetir amanhã')
    expect(fake.studies[0].music_activities).toHaveLength(1)
  })

  it('palavras: adicionar ao vocabulário é explícito e não duplica', async () => {
    const { fake, user } = setup('/music', ['Dreamer'])
    await createStudy(user)
    const addWord = async (term: string, meaning: string, excerpt = '') => {
      await user.click(screen.getByRole('button', { name: 'Adicionar palavra' }))
      const d = await screen.findByRole('dialog', { name: 'Palavra ou expressão do estudo' })
      await user.type(within(d).getByLabelText(/Palavra ou expressão/), term)
      await user.type(within(d).getByLabelText(/Significado/), meaning)
      if (excerpt) await user.type(within(d).getByLabelText(/Trecho curto/), excerpt)
      await user.click(within(d).getByRole('button', { name: 'Salvar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    }
    await addWord('dreamer', 'sonhador')
    await addWord('brotherhood', 'irmandade', 'A brotherhood of man')
    expect(fake.vocabulary).toHaveLength(1) // registrar no estudo NÃO cria no vocabulário

    // palavra já existente no vocabulário → oferece vincular, sem criar outra
    await user.click(screen.getByRole('button', { name: 'Adicionar “dreamer” ao vocabulário' }))
    let d = await screen.findByRole('dialog', { name: 'Palavra já está no vocabulário' })
    await user.click(within(d).getByRole('button', { name: 'Vincular à existente' }))
    await screen.findByText('Palavra vinculada ao vocabulário existente.')
    expect(fake.vocabulary).toHaveLength(1)
    expect(fake.studies[0].music_words[0].vocabulary_id).toBe(fake.vocabulary[0].id)

    // palavra nova → formulário do vocabulário pré-preenchido; exige o 2º exemplo
    await user.click(screen.getByRole('button', { name: 'Adicionar “brotherhood” ao vocabulário' }))
    d = await screen.findByRole('dialog', { name: 'Adicionar palavra' })
    expect(within(d).getByLabelText(/Palavra ou expressão/)).toHaveValue('brotherhood')
    expect(within(d).getByLabelText(/Tradução/)).toHaveValue('irmandade')
    expect(within(d).getByLabelText(/Exemplo 1/)).toHaveValue('A brotherhood of man')
    expect(within(d).getByLabelText('Origem')).toHaveValue(`music:${fake.studies[0].id}`)
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    expect(within(d).getByText('Informe o exemplo 2.')).toBeInTheDocument()
    await user.type(within(d).getByLabelText(/Exemplo 2/), 'The brotherhood met.')
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    await screen.findByText('“brotherhood” adicionada ao vocabulário.')
    expect(fake.vocabulary.map((v) => v.word)).toEqual(['Dreamer', 'brotherhood'])
    expect(screen.getAllByRole('link', { name: 'No vocabulário' })).toHaveLength(2)
  })

  it('lista: em andamento primeiro com Continuar; histórico só com concluídos; concluir/reabrir', async () => {
    const { fake, user, router } = setup()
    await createStudy(user, 'Song A', 'Artist A')
    await user.click(screen.getByRole('button', { name: 'Marcar como concluído' }))
    await screen.findByRole('button', { name: 'Reabrir estudo' })
    await router.navigate('/music')
    await createStudy(user, 'Song B', 'Artist B')
    await router.navigate('/music')
    await screen.findByRole('heading', { name: 'Em andamento' })
    expect(screen.getByRole('link', { name: 'Continuar estudo 2' })).toBeInTheDocument()
    const history = within(screen.getByRole('heading', { name: 'Histórico (concluídos)' }).parentElement!)
    expect(history.getAllByRole('listitem')).toHaveLength(1)
    expect(history.getByText('Song A')).toBeInTheDocument()
    expect(history.getByText('Concluído')).toBeInTheDocument() // rótulo no masculino ("estudo")
    expect(screen.getByText('2 estudos · 1 concluído')).toBeInTheDocument()
    expect(fake.studies.map((s) => s.status).sort()).toEqual(['completed', 'in_progress'])
  })

  it('excluir estudo pede confirmação e informa que o vocabulário é mantido', async () => {
    const { fake, user, router } = setup()
    await createStudy(user)
    await user.click(screen.getByRole('button', { name: 'Excluir estudo' }))
    const d = await screen.findByRole('dialog', { name: 'Excluir estudo musical?' })
    expect(within(d).getByText(/Palavras já adicionadas ao vocabulário continuam lá/)).toBeInTheDocument()
    expect(fake.calls.remove).toBeUndefined()
    await user.click(within(d).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/music'))
    expect(await screen.findByText(/Nenhum estudo musical registrado ainda/)).toBeInTheDocument()
  })

  it('estudo inexistente mostra mensagem e link de volta', async () => {
    setup('/music/00000000-0000-4000-8000-00000000ffff')
    expect(await screen.findByText('Estudo musical não encontrado.')).toBeInTheDocument()
  })
})
