# My English Journey

Site pessoal e responsivo para acompanhar o estudo de inglês. **MVP completo (ET-001 a ET-007)**, pronto para uso diário em ambiente local.

Etapas implementadas:

- **ET-001 — Fundação técnica:** autenticação, rotas privadas, layout, banco com RLS e painel inicial.
- **ET-002 — Cronograma editável e acompanhamento diário:** `/schedule` semanal e indicadores da semana no `/dashboard`.
- **ET-003 — Vocabulário, flashcards e repetição espaçada:** `/vocabulary`, `/reviews` e indicadores no `/dashboard`.
- **ET-004 — Registro de aulas e exercícios:** `/lessons` e `/lessons/:id`, e "Aulas concluídas" no `/dashboard`.
- **ET-005 — Evolução e progresso:** `/progress`.
- **ET-006 — Estudos musicais:** `/music` e `/music/:id`, e "Estudos musicais concluídos" no `/dashboard`.
- **ET-007 — Validação integrada e preparação para uso:** estudos musicais na frequência de `/progress`, ajustes de usabilidade e este guia.

Ainda **não** implementado: importação de registros anteriores (nenhum conteúdo é importado automaticamente).

## Começar a usar (local)

Pré-requisitos: **Node.js LTS (≥ 24)** e **Docker Desktop** em execução.

**1. Instalar e subir o banco local** (só na primeira vez, ou após atualizar o projeto):

```bash
npm ci                 # dependências exatas do package-lock.json
npm run db:start       # sobe o Supabase local no Docker e aplica as 6 migrações
npx supabase status    # mostra API URL e anon key
```

**2. Configurar o `.env.local`** (copie de `.env.example`) com a **API URL** e a **anon/publishable key** mostradas pelo `status`. Nunca use a `service_role`/secret key no frontend.

**3. Criar o seu usuário** (não existe cadastro público): Studio em <http://127.0.0.1:54323> → *Authentication* → *Users* → *Add user* → *Create new user* (marque *Auto Confirm User*). Use uma senha forte. No primeiro login o perfil é criado (nível A1, meta de 60 min); o nível pode ser ajustado em **Progresso**.

**4. Iniciar o app** (todo dia):

```bash
npm run db:start       # se o Docker foi reiniciado
npm run dev            # http://localhost:5173
```

### Rotina diária sugerida

1. **Painel** → veja a semana e use **Revisar agora** quando houver palavras na fila.
2. **Cronograma** → confira o dia e conclua as atividades informando os minutos reais.
3. **Aulas** ou **Música** → registre a aula/estudo do dia (blocos, exercícios, notas, atividades, compreensão).
4. **Vocabulário** → adicione palavras (ou use "Adicionar ao vocabulário" dentro do estudo musical).
5. **Revisões** → revise os flashcards (atalhos 1–4).
6. **Progresso** → acompanhe horas, frequência, notas e habilidades por período.

### Backup e cuidados com os dados

Os dados ficam no banco **local** do Docker. `npm run db:stop` (ou desligar o computador) **preserva** os dados.

- **Nunca rode `npm run db:reset` com dados reais**: ele recria o banco do zero e apaga tudo.
- **Backup** (recomendado com frequência, por exemplo semanal):

  ```bash
  npx supabase db dump --local --data-only -f backups/meus-dados-AAAA-MM-DD.sql
  ```

  O arquivo contém seus usuários e todos os registros. Guarde-o fora do projeto ou de qualquer repositório público (contém o hash da sua senha e seus dados pessoais).
- **Restaurar** em um banco local **vazio** (por exemplo, recém-criado):

  ```bash
  docker exec -i supabase_db_my-english-journey psql -U postgres -d postgres -v ON_ERROR_STOP=1 < backups/meus-dados-AAAA-MM-DD.sql
  ```

  (Procedimento testado: reset → restauração → login com o mesmo usuário e os mesmos dados.)

## Arquitetura de produção (planejada — ainda não publicada)

```
Navegador ──HTTPS──▶ Cloudflare Pages (arquivos estáticos de dist/, SPA)
    │
    └────HTTPS──▶ Supabase Cloud
                   ├─ Auth (e-mail/senha, cadastro público DESLIGADO)
                   └─ PostgreSQL + RLS (6 migrações deste repositório)
```

- O frontend é **100% estático** (React + Vite): não há servidor próprio nem funções serverless.
- O navegador fala direto com o Supabase usando só a **chave pública** (anon/publishable). Toda a proteção dos dados está no banco: **RLS** em todas as tabelas, FKs que impedem misturar dados de contas diferentes e funções `SECURITY INVOKER` (as únicas `SECURITY DEFINER` são as 4 da ET-001: `create_my_profile` e as três de integridade da origem do vocabulário, todas com `search_path` vazio).
- Rotas como `/dashboard`, `/lessons` e `/progress` são resolvidas no navegador (React Router). Acesso direto e reload funcionam desde que o host entregue `index.html` para qualquer caminho — validado com o build de produção.

## Publicação: Cloudflare Pages + Supabase Cloud (checklist)

> Nada disso foi executado ainda. Nunca grave valores reais de produção no código: eles ficam só no painel do Cloudflare e no seu `.env.local`.

### 1. Supabase Cloud — banco e autenticação

1. Crie um projeto em <https://supabase.com/dashboard> (região próxima, por exemplo São Paulo) e anote o **Project ref**.
2. **Aplique as 6 migrações** deste repositório (pasta `supabase/migrations/`):

   ```bash
   npx supabase login                          # abre o navegador; não cole tokens em chats
   npx supabase link --project-ref <project-ref>
   npx supabase db push --dry-run              # lista o que seria aplicado, sem alterar nada
   npx supabase db push                        # aplica 202611090001 … 202611100005 em ordem
   npx supabase migration list                 # confere: local e remoto com as mesmas 6 versões
   ```

   Não use `db reset` no projeto remoto.
3. **Desative o cadastro público (obrigatório):** *Authentication* → *Sign In / Providers* → **Allow new users to sign up** = desligado. O `enable_signup = false` de `supabase/config.toml` vale **só no ambiente local**; sem desligar no painel, qualquer pessoa poderia criar uma conta no seu projeto.
4. Mantenha o provedor **Email** habilitado e, nas configurações de senha do *Authentication*, defina uma política forte (por exemplo, mínimo de 12 caracteres).
5. **Crie a sua conta:** *Authentication* → *Users* → *Add user* → *Create new user* (marque *Auto Confirm User*), com senha forte. No primeiro login o app cria o seu perfil (nível A1, meta 60 min) — ajuste o nível em **Progresso**.
6. **URLs de autenticação:** *Authentication* → *URL Configuration*:
   - **Site URL:** a URL final do site (por exemplo `https://my-english-journey.pages.dev` ou o seu domínio).
   - **Redirect URLs:** a mesma URL com `/**` (por exemplo `https://my-english-journey.pages.dev/**`) e, se quiser testar previews, `https://*.my-english-journey.pages.dev/**`.
   - O login atual é por e-mail/senha (sem links mágicos), mas essas URLs evitam redirecionamentos para `localhost` em e-mails de recuperação.
7. Copie de *Project Settings* → *API*: **Project URL** e **anon/publishable key**. **Não** copie a `service_role`/secret key para lugar nenhum do frontend.
8. Revise antes de usar: grants e privilégios das funções (as migrações já revogam `anon` e `TRUNCATE`), e evite rodar SQL manual no SQL Editor sem backup.

### 2. Cloudflare Pages — frontend

1. *Workers & Pages* → *Create* → *Pages* → *Connect to Git* → selecione `fogeid/my-english-journey`, branch `main`.
2. Configuração do build:

   | Campo | Valor |
   |---|---|
   | Framework preset | Vite (ou None) |
   | **Build command** | `npm run build` |
   | **Build output directory** | `dist` |
   | Root directory | `/` |
   | Node.js | defina a variável `NODE_VERSION=24` |

3. **Variáveis de ambiente** (*Settings* → variáveis de ambiente do projeto, ambiente **Production** e, se usar, **Preview**):

   | Variável | Valor | Observação |
   |---|---|---|
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Project URL do Supabase |
   | `VITE_SUPABASE_ANON_KEY` | anon/publishable key | chave **pública**; nunca a service_role |
   | `NODE_VERSION` | `24` | versão do Node no build |

   As variáveis `VITE_*` são lidas **no momento do build** e embutidas no bundle: depois de alterá-las, faça um novo deploy. Sem elas o app abre com o erro "Configuração ausente".
4. **SPA:** não é preciso arquivo de redirecionamento. O build não gera `404.html`, então o Cloudflare Pages entrega `index.html` para qualquer rota (comportamento de SPA). Não adicione um `404.html` em `public/`.
5. Após o primeiro deploy, atualize a **Site URL / Redirect URLs** do Supabase (passo 1.6) com a URL definitiva.

### 3. Verificação após publicar

- Abrir diretamente `/dashboard`, `/lessons` e `/progress` (sem sessão → login; após login → a página certa; reload mantém a página).
- Tentar criar conta: **não deve existir** cadastro (só login).
- Login e logout com a sua conta; criar e apagar um registro de teste em cada módulo.
- No navegador (*DevTools* → *Sources*), confirmar que o bundle contém apenas a URL do projeto e a chave anon.

### 4. Backup em produção

- **Banco:** periodicamente (por exemplo, semanal), com o projeto vinculado:

  ```bash
  npx supabase db dump --linked --data-only -f backups/prod-AAAA-MM-DD.sql
  ```

  A pasta `backups/` e qualquer `.sql` fora de `supabase/migrations/` são ignorados pelo Git — guarde os arquivos fora de repositórios públicos (contêm seus dados e o hash da senha). Verifique também, no painel do Supabase (*Database* → *Backups*), quais backups automáticos o seu plano oferece — não conte só com eles.
- **Código:** o GitHub é a fonte do código e das migrações; os dados ficam só no Supabase e nos seus dumps.
- **Restauração:** em um banco vazio com as 6 migrações aplicadas, `psql "<connection string>" -v ON_ERROR_STOP=1 -f backups/<arquivo>.sql` (a connection string fica em *Project Settings* → *Database*; não a versione).

## Estudos musicais (ET-006)

- **`/music`:** estudos **em andamento** primeiro (botão **Continuar**) e o **histórico dos concluídos**. **Novo estudo** sugere o próximo número, a data de hoje e o nível do perfil.
- **Estudo:** número (único), música, artista, data, nível (A1–C2), status (em andamento / concluído; dá para reabrir) e observações gerais.
- **Compreensão inicial e final** (0 a 10, 1 casa decimal, com comentário opcional). A **diferença = final − inicial** aparece quando as duas existem.
- **Cinco atividades fixas** (primeira escuta e compreensão inicial; vocabulário e expressões; tradução e interpretação de trechos curtos; pronúncia e reconhecimento auditivo; escuta final e avaliação da evolução), cada uma com minhas respostas, dificuldades, correções, explicações e observações. No máximo um registro por atividade (salvar de novo atualiza).
- **Palavras e expressões do estudo** (termo, significado e um trecho curto de até 300 caracteres). Registrar no estudo **não** cria nada no vocabulário; o botão **Adicionar ao vocabulário** é a opção explícita: se a palavra já existir no vocabulário (mesma regra da ET-003, sem diferenciar maiúsculas), o app oferece **vincular** à existente; senão abre o formulário do vocabulário pré-preenchido (origem = este estudo), que exige os dois exemplos.
- **Direitos autorais:** só texto digitado por você, com limites curtos. O app não baixa, armazena nem reproduz áudio, não busca letras e não faz transcrição ou correção automática.
- **Excluir** um estudo (com confirmação) exclui suas atividades e palavras do estudo; palavras já adicionadas ao vocabulário continuam lá (a origem passa a "Manual").

## Progresso (ET-005)

`/progress` só **lê** dados já registrados (nenhuma migração, nenhuma nota ou nível é criado). Períodos: **7, 30 ou 90 dias** (hoje incluído) ou **todo o período**, por dia civil em **America/Cuiaba**. Padrão: 30 dias.

| Indicador | Fonte | Regra |
|---|---|---|
| Nível | `profiles.current_level` | informado por você (pode ser alterado na própria página); **nunca** inferido das notas |
| Aulas concluídas | `lessons` | `status = completed` com data da aula no período ("todo o período" inclui aulas sem data) |
| Horas estudadas | `study_sessions` | soma de `actual_minutes` das execuções **concluídas** (reabertas não contam), pelo dia real da conclusão. Aulas não têm campo de tempo e não há vínculo atividade↔aula, então não há dupla contagem |
| Planejado × realizado | `study_activities` + `study_sessions` | atividades com **dia planejado** no período; realizadas = com execução concluída (minutos registrados); taxa = realizadas ÷ planejadas |
| Palavras cadastradas | `vocabulary` | total de todo o período, + quantas foram cadastradas no período |
| Revisões de vocabulário | `vocabulary_reviews` | revisões feitas no período |
| Frequência | sessões concluídas, aulas, revisões e estudos musicais | **dia de estudo** = dia com ao menos uma atividade concluída, aula registrada (data da aula), revisão ou **estudo musical concluído** (data registrada; ET-007) — cada dia conta uma vez e a música não soma horas; frequência = dias de estudo ÷ (dias do período ÷ 7). "Todo o período" começa no 1º dia de estudo. Gráfico: dias de estudo por semana ISO (até 26 semanas) |
| Evolução das notas | `lessons` + `lesson_blocks` | nota geral (regra da ET-004) de cada aula **concluída**, **com data** e **com ao menos um bloco avaliado**, em ordem de data |
| Desempenho por habilidade | `lesson_blocks` | média simples das notas dos blocos grammar, vocabulary, listening, speaking, reading e writing de aulas **concluídas**; blocos sem nota e o bloco de **revisão** ficam de fora |
| Dificuldades e recomendações | `lessons` | aulas do período que têm esses campos preenchidos, com link para a aula |

`skill_assessments` (ET-001) não é usada: está vazia e nenhuma tela grava nela. As leituras são paginadas (o PostgREST devolve no máximo 1000 linhas por requisição), então os totais não são truncados.

Gráficos em SVG/HTML, sem biblioteca: série única em um só matiz, rótulos seletivos, leitura do valor ao passar o mouse ou focar pelo teclado e **tabela de dados** ("Ver dados em tabela") como alternativa.

## Aulas (ET-004)

- **`/lessons`:** aulas **em andamento** no topo (botão **Continuar**) e o **histórico** completo (mais recentes primeiro) com data, nível, nº de blocos e nota geral. **Nova aula** sugere o próximo número, a data de hoje (America/Cuiaba) e o nível do perfil.
- **Aula:** número (único), título, data, nível (A1–C2), assuntos (um por linha ou separados por vírgula), observações e status (**em andamento** / **concluída**; dá para reabrir).
- **Blocos de estudo:** gramática, vocabulário, listening, speaking, reading, writing e revisão — no máximo um de cada tipo por aula. Cada bloco tem **nota de 0 a 10** (opcional, 1 casa decimal; aceita "8,5") e observações.
- **Exercícios** em cada bloco: enunciado (obrigatório), minha resposta, resposta corrigida e explicação. Não há correção automática.
- **Nota geral da aula = média simples das notas dos blocos avaliados, arredondada para 1 casa decimal.** Blocos sem nota não entram; sem nenhum bloco avaliado, a aula fica sem nota ("—"). A nota é calculada na hora (`overallScore` em `src/features/lessons/lesson-model.ts`), não é gravada.
- **Dificuldades identificadas** e **recomendações para estudos futuros** por aula.
- **Exclusões** (aula, bloco, exercício) sempre pedem confirmação; excluir a aula exclui seus blocos e exercícios, e palavras do vocabulário vinculadas a ela passam a "Manual".

## Vocabulário e revisões (ET-003)

- **`/vocabulary`:** cadastro com palavra/expressão (1–120), tradução (1–240) e **dois exemplos obrigatórios** (1–500 cada); categoria, notas e origem (manual, ou uma aula/música já cadastrada) opcionais. Espaços nas pontas são removidos. Busca por palavra ou tradução, filtros **Todas / Pendentes** (revisão vencida) **/ Sem revisão**, ordem alfabética, `Carregar mais` de 50 em 50.
- **Sem duplicatas:** a mesma palavra (ignorando maiúsculas e espaços) não pode ser cadastrada duas vezes pela mesma conta; o formulário orienta a editar o registro existente.
- **Editar** não altera a próxima revisão nem o histórico. **Excluir** só é possível para palavras **sem revisões** (o banco bloqueia o restante).
- **`/reviews`:** a fila traz primeiro as revisões vencidas (mais antigas antes) e depois as palavras novas (ordem de cadastro). Frente = termo; **Mostrar resposta** revela tradução e exemplos; só então aparecem **Errei / Difícil / Bom / Fácil** (atalhos 1–4). Uma falha ao salvar não avança o cartão; repetir reenvia a mesma requisição (idempotente).
- **Agendamento (regra MVP, calculada no servidor — não é uma afirmação de eficácia pedagógica e pode ser trocada no futuro):**

  | Resposta | Próxima revisão | Sequência |
  |---|---|---|
  | Errei | 10 minutos | volta a 0 |
  | Difícil | 1 dia | mantém |
  | Bom | 1, 3, 7, 14, depois 30 dias (sequência 0, 1, 2, 3, 4+) | +1 |
  | Fácil | 3, 7, 14, depois 30 dias (sequência 0, 1, 2, 3+) | +1 |

  Sequência limitada a 100; 1 dia = 24 h; horários gravados em UTC e exibidos em America/Cuiaba.
- **Dashboard:** "Revisões pendentes" continua contando só as **vencidas**; "Palavras novas" (nunca revisadas) aparece separado, com o botão **Revisar agora**. Ambos usam a hora do servidor, como a fila.

## Cronograma — subatividades e gerador semanal (ET-007)

- **Subatividades (etapas)** opcionais em qualquer atividade: título (1–120), descrição (até 1000), minutos (1–240), ordem; no máximo 20 por atividade. Criadas, editadas, reordenadas (↑/↓) e removidas no próprio formulário da atividade, gravadas numa única operação atômica (`save_activity`).
- Com etapas, os **minutos previstos da atividade = soma das etapas** (até 240), calculados e exibidos como somente leitura. O dashboard e o resumo continuam contando **só a atividade principal** — nada é contado duas vezes.
- No cartão: **N/M etapas**, barra de progresso e lista expansível (recolhida por padrão) com uma caixa por etapa.
- **Sincronização:**
  - marcar a **última** etapa pendente conclui a atividade, pedindo antes os **minutos reais** (mesma regra da ET-002);
  - desmarcar uma etapa reabre a atividade (minutos preservados);
  - concluir a atividade marca todas as etapas; reabrir deixa todas pendentes.
- Atividades antigas, sem etapas, funcionam exatamente como antes.
- **Gerar cronograma semanal:** data de início, dias (1–14; padrão 7), próxima aula nº (padrão 4), próximo estudo musical nº (padrão 2), durações (padrão 60/60) e complementares (sim/não).
  - Por dia: **Aula ChatGPT** (6 etapas: 10/15/10/10/10/5 min), **Estudo musical** (5 etapas: 10/15/15/10/10 min) e as complementares do dia da semana (seg Duolingo 20; ter Podcast A1 30; qua BBC Learning English 25; qui Duolingo 20 + Flashcards 10; sex Série em inglês 30; sáb Leitura A1 30; dom Revisão e conversação 30). Com outra duração, as etapas são reescaladas proporcionalmente.
  - Temas planejados: aulas 04–10 e músicas 02–08 (só título, artista e foco — **sem letras**). Fora disso: "tema a definir".
  - **Prévia antes de gravar**, com selos *Nova* / *Já existe* / *Conflito* e o motivo. Só os itens novos e marcados são gravados; nada existente é sobrescrito.
  - Idempotente: cada item tem uma chave (`generator_key`, única por usuário) e reexecutar não duplica. A gravação é tudo ou nada e cria os planos semanais que faltarem.
  - Nada é marcado como concluído, nenhuma aula ou estudo musical é registrado e nenhuma nota é atribuída.
- **Limitação conhecida:** ao remover etapas pendentes de uma atividade em que as restantes já estão concluídas, a atividade **não** é concluída automaticamente (faltam os minutos reais); use **Concluir**.

## Cronograma (ET-002)

- **Semana ISO** (segunda a domingo) no fuso **America/Cuiaba**. Datas do plano são dias civis (`DATE`).
  Anterior / Hoje / Próxima saltam 7 dias; a semana visitada fica na URL (`/schedule?week=AAAA-MM-DD`).
- **Nada é criado ao abrir a página.** Numa semana sem plano:
  - **Criar meu plano inicial** (somente na semana atual): cria o plano e 5 atividades na segunda-feira (60 min). Terça a domingo ficam vazios. Idempotente: se o plano da semana já existe, nada muda.
  - **Criar plano vazio** (qualquer semana). No máximo um plano por semana; nada é copiado de outras semanas.
- **Atividades:** título (1–120), descrição opcional (até 2000), categoria (`lesson`, `music`, `grammar`, `vocabulary`, `listening`, `speaking`, `reading`, `review`, `other` — as três primeiras, ET-007), minutos previstos (1–240), dia e ordem. No máximo 30 por dia. Editar permite mudar de dia **dentro da mesma semana**; a ordem é ajustada com os botões ↑/↓.
- **Conclusão:** pede os minutos reais (0–480) e só registra após confirmação; `0` = concluída sem tempo medido. Cada atividade tem **uma única execução** (`study_sessions`), atualizada a cada nova conclusão.
- **Reabrir:** a execução deixa de contar como concluída, mas minutos, `completed_at` e o registro são preservados.
- **Exclusão:** só para atividades **sem execução**. Atividades com execução (concluída ou reaberta) não podem ser excluídas, nem por cascata ao excluir o plano. O cliente não pode apagar execuções.
- **Dashboard:** atividades concluídas, minutos registrados e progresso (concluídas / planejadas, 0% sem atividades) da semana atual, agregados pela **semana planejada** e contando só execuções concluídas.

> **Exclusão de conta:** como o histórico de execução é protegido sem exceções, excluir um usuário que tenha execuções registradas falha (o cascade é bloqueado). Os testes locais apagam explicitamente as execuções das contas fictícias antes de removê-las (`tests/rls/test-accounts.ts`). Uma estratégia de exclusão de conta para uso real ainda precisa ser decidida.

## Stack

React 19 + TypeScript + Vite · Tailwind CSS v4 · React Router · Supabase (Auth + PostgreSQL com RLS) · lucide-react · Vitest + Testing Library · oxlint.
As versões exatas estão fixadas em `package-lock.json`.

## Instalação e primeiro usuário

Veja **Começar a usar (local)** no início deste arquivo.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento Vite |
| `npm run build` | Typecheck + build de produção em `dist/` |
| `npm run lint` | oxlint (falha também em warnings) |
| `npm run typecheck` | `tsc -b` (app, testes e configs) |
| `npm run test` | Testes unitários de UI/rotas (jsdom, Supabase simulado) |
| `npm run test:rls` | Teste integrado de RLS contra o **Supabase local** |
| `npm run db:start` / `db:stop` | Sobe / para o Supabase local |
| `npm run db:reset` | Recria o banco **local** e reaplica as migrações (apaga dados locais) |

## Banco de dados

Migrações (incrementais, aplicadas em ordem):

1. `supabase/migrations/202611090001_initial.sql` — ET-001 (não alterar).
2. `supabase/migrations/202611100001_schedule.sql` — ET-002: colunas `description`/`position` em `study_activities`, `is_completed`/`reopened_at` em `study_sessions`, constraints de limites, unicidade de execução por atividade, triggers de integridade e as funções `create_initial_plan`, `complete_activity`, `reopen_activity`, `reorder_day_activities` e `get_week_summary` (todas `SECURITY INVOKER`, `EXECUTE` só para `authenticated`). Revoga privilégios desnecessários nas tabelas do cronograma. Verifica colisões com dados existentes antes de criar as constraints (aborta sem apagar nada).
3. `supabase/migrations/202611100002_vocabulary_review.sql` — ET-003: colunas `notes`, `review_streak`, `review_count` em `vocabulary`; `request_id`, `interval_minutes`, `streak_after`, `next_review_at` em `vocabulary_reviews`; limites, unicidade normalizada por usuário, idempotência por `request_id`; FK do histórico passa a bloquear a exclusão da palavra (a exclusão da conta continua em cascata); funções `review_vocabulary` (revisão atômica, com trava da palavra), `get_review_queue`, `get_vocabulary_summary` e `list_vocabulary`, todas `SECURITY INVOKER` e só para `authenticated`.
4. `supabase/migrations/202611100003_lessons.sql` — ET-004: colunas `title`, `level`, `status`, `difficulties`, `recommendations` em `lessons` (reaproveita `lesson_number`, `studied_on`, `topics`, `report`); tabelas `lesson_blocks` e `lesson_exercises` com FKs compostas (mesmo dono), RLS e cascata ao excluir a aula/bloco. Sem funções novas.
5. `supabase/migrations/202611100004_music.sql` — ET-006: colunas `study_number`, `level`, `status`, `initial_score`, `final_score` em `music_studies` (reaproveita `song`, `artist`, `studied_on`, `report`, `initial_comprehension`/`final_comprehension` como comentários); tabelas `music_activities` e `music_words` com FKs compostas (mesmo dono), RLS e cascata; `music_words.vocabulary_id` liga opcionalmente ao vocabulário. Sem funções novas.
6. `supabase/migrations/202611100005_schedule_subactivities.sql` — ET-007:
   - tabela `study_subactivities` (FK composta com a atividade do mesmo dono, cascata ao excluir a atividade, RLS com 4 policies);
   - coluna `study_activities.generator_key` (índice único parcial por usuário) e categorias `lesson`, `music` e `reading`;
   - funções `save_activity`, `set_subactivity_completed`, `generate_schedule` e `schedule_write_steps` (auxiliar, confere o dono);
   - `complete_activity`/`reopen_activity` recriadas com o mesmo contrato, agora sincronizando as etapas.
   Tudo `SECURITY INVOKER`, com `EXECUTE` só para `authenticated`. Aborta se a tabela já existir; não altera dados existentes.

Para aplicar uma nova migração no banco local **sem perder dados**: `npx supabase migration up`. Para recriar o banco local do zero (apaga os dados locais): `npm run db:reset`.

Tabelas (todas com RLS) — nove da ET-001, mais `lesson_blocks` e `lesson_exercises` (ET-004) e `music_activities` e `music_words` (ET-006):
`profiles`, `study_plans`, `study_activities`, `study_sessions`, `lessons`, `vocabulary`, `vocabulary_reviews`, `music_studies`, `skill_assessments`.

- **Políticas:** cada usuário só lê, cria, altera e apaga as próprias linhas (`user_id = auth.uid()`), apenas para a role `authenticated`. Em `profiles` o cliente só pode ler e alterar o próprio perfil; a criação é feita pela RPC `create_my_profile`.
- **`create_my_profile()`:** `SECURITY DEFINER`, `search_path = ''`, rejeita `auth.uid()` nulo, `EXECUTE` revogado de `PUBLIC` e `anon`, concedido só a `authenticated`.
- **Referências entre tabelas:** FKs compostas `(user_id, id)` impedem vincular um registro a um recurso de outro usuário. Em referências opcionais (`study_sessions.activity_id`, `skill_assessments.lesson_id`), `ON DELETE SET NULL (coluna)` anula só a coluna opcional e preserva `user_id`.
- **`vocabulary.source_ref`** (polimórfica): um trigger exige que a referência seja uma `lesson` (se `source_type = 'lesson'`) ou um `music_study` (se `'music'`) **do mesmo usuário**; com `manual`/nulo, `source_ref` deve ser nulo. Ao apagar a origem, `source_ref` é anulado; a origem referenciada não pode trocar de dono.

Publicação em um projeto remoto: veja **Preparar uma publicação futura** no início deste arquivo.

## Testes

```bash
npm run test               # unitários (não precisam de Supabase)
npm run db:start           # necessário para o teste abaixo
npm run test:rls           # integrado contra o Supabase local (ET-001 a ET-007)
```

O teste RLS recusa rodar se a URL do Supabase não for `localhost`/`127.0.0.1`. Ele cria duas contas fictícias **locais**, insere dados mínimos de teste e remove tudo ao final.

## Estrutura

```
src/
  app/            router.tsx, providers.tsx
  components/
    layout/       AppLayout (sidebar desktop, menu mobile, topo com logout), NotFound
    ui/           estados de loading/erro, cabeçalho, placeholder
  features/
    auth/         AuthProvider, contexto, guards de rota, LoginPage
    dashboard/    DashboardPage + consultas de contagem
    schedule/     cronograma: week.ts (datas/fuso), schedule-model.ts (regras), schedule-service.ts,
                  useWeeklySchedule, SchedulePage e componentes (dia, atividade, formulário, diálogos)
    lessons/ vocabulary/ reviews/ music/ progress/   (placeholders)
  lib/            supabase.ts (cliente), supabase-context.ts, database.types.ts
  main.tsx
supabase/
  config.toml     configuração do Supabase local (signup desabilitado)
  migrations/202611090001_initial.sql
  migrations/202611100001_schedule.sql
  migrations/202611100002 … 202611100005 (vocabulário, aulas, música, subatividades/gerador)
tests/
  unit/           rotas, autenticação, dashboard, datas/validação, cronograma (serviço em memória)
  rls/            testes integrados contra o Supabase local (ET-001 e ET-002)
```

`src/lib/database.types.ts` é gerado a partir do banco local:

```bash
npx supabase gen types typescript --local > src/lib/database.types.ts
```
