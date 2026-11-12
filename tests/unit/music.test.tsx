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

  it('palavras: sincronizam automaticamente com o vocabulário, sem duplicar; significado obrigatório', async () => {
    const { fake, user } = setup('/music', ['Dreamer'])
    await createStudy(user)
    const openWordForm = async () => {
      await user.click(screen.getByRole('button', { name: 'Adicionar palavra' }))
      return screen.findByRole('dialog', { name: 'Palavra ou expressão do estudo' })
    }
    const addWord = async (term: string, meaning: string, excerpt = '') => {
      const d = await openWordForm()
      await user.type(within(d).getByLabelText(/Palavra ou expressão/), term)
      await user.type(within(d).getByLabelText(/Significado/), meaning)
      if (excerpt) await user.type(within(d).getByLabelText(/Trecho curto/), excerpt)
      await user.click(within(d).getByRole('button', { name: 'Salvar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    }

    // significado obrigatório: nada é enviado sem ele
    let d = await openWordForm()
    await user.type(within(d).getByLabelText(/Palavra ou expressão/), 'imagine')
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    expect(within(d).getByText('Informe o significado.')).toBeInTheDocument()
    expect(fake.calls.addWord).toBeUndefined()
    await user.click(within(d).getByRole('button', { name: 'Cancelar' }))

    // já existe no vocabulário → só vincula (sem criar outra)
    await addWord('dreamer', 'sonhador')
    expect(await screen.findByText(/Palavra registrada no estudo e vinculada à palavra que já estava no vocabulário/)).toBeInTheDocument()
    // nova → criada no vocabulário com tradução e exemplo do estudo
    await addWord('brotherhood', 'irmandade', 'A brotherhood of man')
    expect(await screen.findByText('Palavra registrada no estudo e adicionada ao vocabulário.')).toBeInTheDocument()
    expect(fake.vocabulary.map((v) => [v.word, v.translation, v.example_1])).toEqual([
      ['Dreamer', 't', null],
      ['brotherhood', 'irmandade', 'A brotherhood of man'],
    ])
    expect(screen.getAllByRole('link', { name: 'No vocabulário' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Sincronizar com o vocabulário' })).not.toBeInTheDocument()

    // falha da transação: erro exibido, nada gravado, nada de mensagem de sucesso
    fake.failOnce()
    d = await openWordForm()
    await user.type(within(d).getByLabelText(/Palavra ou expressão/), 'world')
    await user.type(within(d).getByLabelText(/Significado/), 'mundo')
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    expect(await within(d).findByRole('alert')).toHaveTextContent('Não foi possível salvar')
    expect(fake.vocabulary).toHaveLength(2)
    expect(fake.studies[0].music_words).toHaveLength(2)
    expect(screen.queryByText(/Palavra registrada/)).not.toBeInTheDocument()
  })

  it('palavras antigas: editar acrescenta o significado e sincroniza; sincronização retroativa; excluir preserva o vocabulário', async () => {
    const fake = createFakeMusicService(['love'])
    const sid = await fake.service.create('00000000-0000-4000-8000-0000000000aa', { study_number: 1, song: 'Old', artist: 'Band', studied_on: '2026-11-01', level: 'A1', report: null })
    const legacy = (term: string, meaning: string | null) =>
      fake.studies[0].music_words.push({ id: `00000000-0000-4000-8000-0000000009${fake.studies[0].music_words.length}0`, user_id: fake.studies[0].user_id, music_study_id: sid, term, meaning, excerpt: null, vocabulary_id: null, created_at: new Date().toISOString() })
    legacy('LOVE', null) // já existe no vocabulário
    legacy('heart', 'coração') // nova, com significado
    legacy('gonna', null) // sem significado → pendente
    const { client } = createFakeSupabase({ session: makeSession() })
    const user = userEvent.setup()
    renderApp(client, `/music/${sid}`, undefined, undefined, undefined, fake.service)

    expect(await screen.findByText(/3 palavras deste estudo ainda não estão no vocabulário/)).toBeInTheDocument()
    expect(screen.getAllByText('Fora do vocabulário: falta o significado')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Sincronizar com o vocabulário' }))
    expect(
      await screen.findByText('Sincronização concluída: 1 palavra adicionada ao vocabulário; 1 vinculada a palavra existente; 1 pendente sem significado (edite para sincronizar).'),
    ).toBeInTheDocument()
    expect(fake.vocabulary.map((v) => v.word)).toEqual(['love', 'heart'])

    // editar a pendente: a palavra em inglês não muda; com significado, sincroniza
    await user.click(screen.getByRole('button', { name: 'Editar “gonna”' }))
    const d = await screen.findByRole('dialog', { name: 'Editar palavra do estudo' })
    expect(within(d).getByLabelText(/Palavra ou expressão/)).toHaveAttribute('readonly')
    await user.type(within(d).getByLabelText(/Significado/), 'vou')
    await user.click(within(d).getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Palavra atualizada no estudo; adicionada ao vocabulário.')).toBeInTheDocument()
    expect(fake.vocabulary.map((v) => v.word)).toEqual(['love', 'heart', 'gonna'])
    expect(screen.queryByRole('button', { name: 'Sincronizar com o vocabulário' })).not.toBeInTheDocument()

    // idempotente: rodar de novo não cria nada
    expect(await fake.service.syncWords()).toEqual({ created: 0, linked: 0, pending: 0 })

    // editar uma já vinculada não altera o vocabulário
    await user.click(screen.getByRole('button', { name: 'Editar “heart”' }))
    const e = await screen.findByRole('dialog', { name: 'Editar palavra do estudo' })
    await user.clear(within(e).getByLabelText(/Significado/))
    await user.type(within(e).getByLabelText(/Significado/), 'coração (órgão)')
    await user.click(within(e).getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Palavra atualizada no estudo; o vocabulário não foi alterado.')).toBeInTheDocument()
    expect(fake.vocabulary[1].translation).toBe('coração')

    // excluir do estudo: o vocabulário continua
    await user.click(screen.getByRole('button', { name: 'Excluir “heart” deste estudo' }))
    const c = await screen.findByRole('dialog', { name: 'Excluir palavra do estudo?' })
    expect(within(c).getByText(/A palavra continua no seu vocabulário/)).toBeInTheDocument()
    await user.click(within(c).getByRole('button', { name: /Excluir/ }))
    await screen.findByText('Palavra excluída do estudo.')
    expect(fake.vocabulary.map((v) => v.word)).toEqual(['love', 'heart', 'gonna'])
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
