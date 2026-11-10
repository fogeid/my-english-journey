# ET-002 — Cronograma editável e acompanhamento diário

**Projeto:** My English Journey  
**Versão:** 1.0 — 2026-11-09  
**Status:** especificação para revisão e implementação; NÃO executada  
**Dependência:** ET-001 concluída no repositório local.

## 0. Contrato obrigatório para Claude Code

1. Antes de alterar qualquer arquivo, leia `ET-001-My-English-Journey.md`, `README.md`, a migração `supabase/migrations/202611090001_initial.sql`, os tipos gerados, os componentes atuais e os testes existentes. Inspecione a estrutura real das tabelas `study_plans`, `study_activities`, `study_sessions` e `profiles`.
2. Apresente plano curto e lista de arquivos afetados, incluindo quaisquer divergências entre a migração existente e as hipóteses desta ET. **Aguarde aprovação explícita antes de editar.**
3. Reutilize a arquitetura React/TypeScript/Vite/Tailwind/Supabase da ET-001. Não reescreva autenticação, RLS existente ou navegação sem necessidade demonstrada.
4. Trabalhe somente no cronograma, registro de execução e indicadores derivados do cronograma. Não implementar flashcards, vocabulário, música, importação histórica, gráficos avançados, IA, notificações, PWA ou deploy.
5. Não executar operações destrutivas em banco remoto; não usar credenciais de produção; não criar commit, push ou deploy sem autorização. Não apagar nem sobrescrever dados existentes.
6. Não criar conteúdo de aulas para terça a domingo sem fonte fornecida. O plano inicial contém apenas a segunda-feira descrita nesta ET. Para outros dias, apresentar estado vazio e permitir criação manual.
7. Qualquer alteração de esquema deve ser **migração incremental** (nova migration), nunca reescrever a migration da ET-001 já aplicada.
8. Caso as colunas reais diverjam da referência SQL abaixo, adaptar o SQL ao esquema real, justificar a adaptação no plano e validar o resultado. **Não aplicar cegamente a referência.**

## 1. Objetivo e limites

Entregar `/schedule` funcional com visualização semanal (segunda–domingo), navegação por semana, criação/edição/remoção segura de atividades planejadas, conclusão e reabertura, registro explícito de minutos reais, e indicadores reais no `/dashboard`. Todos os dados são por usuário autenticado e persistidos no Supabase local.

**Fora de escopo:** templates recorrentes automáticos; replicar semanas automaticamente; editor drag-and-drop; timer; lembretes; pontuação/XP; nível CEFR automático; importação das Aulas 01–03 ou de *Count on Me*; CRUD de `lessons`, `vocabulary` e `music_studies`.

## 2. Regras de negócio

### 2.1 Semana e datas

- Semana ISO: segunda 00:00 até domingo 23:59:59.999 no fuso `America/Cuiaba`, com armazenamento de `week_start` como DATE local. Datas do plano são dias civis, não timestamps UTC.
- Setas anterior/próxima avançam exatamente sete dias; botão Hoje volta à semana atual; exibir intervalo e dias sem atividades.
- Cada semana é independente. Nenhuma edição propaga alterações para outra semana.
- Na primeira visita do usuário a `/schedule`, disponibilizar ação explícita **Criar meu plano inicial**; nunca criar registros por simples renderização ou navegação. Criar somente a semana atual, com a segunda-feira conhecida. Se já existir plano naquela semana, a ação é idempotente e não duplica dados.
- O usuário pode criar um plano vazio para qualquer semana. No máximo um plano por usuário e `week_start`; não copiar automaticamente atividades de outras semanas.
- `day` deve representar 1=segunda ... 7=domingo, ou ser convertido consistentemente se o esquema existente usar outro padrão. Documentar a decisão.

### 2.2 Atividades planejadas

- Campos: dia, título, descrição/conteúdo, categoria/habilidade, duração planejada em minutos e posição/ordem.
- Categorias aceitas no MVP: `grammar`, `vocabulary`, `listening`, `speaking`, `review`, `other`; `other` não cria módulo de vocabulário.
- `planned_minutes`: inteiro entre 1 e 240. Título obrigatório, 1–120 caracteres; descrição opcional até 2000 caracteres. No máximo 30 atividades por dia para evitar cadastros acidentais.
- Criar, editar, mover para outro dia da **mesma semana** e excluir atividade sem execução registrada.
- Atividade com execução registrada não pode ser excluída nem ter a execução apagada implicitamente. Permitir edição de título/descrição/categoria/duração prevista, mantendo histórico de tempo real; para excluir atividade já executada, bloquear e explicar. Não implementar arquivamento nesta etapa.
- Ordem persistente por dia. Não requer drag-and-drop; usar controle simples de posição ou ordenar por `position`, depois ID.

### 2.3 Execução, conclusão e reabertura

- `study_sessions` é a fonte da verdade da execução; não criar campo de conclusão paralelo na tabela de atividades se já houver suporte equivalente no esquema real.
- Uma atividade tem no máximo **uma execução ativa** nesta etapa. Conclusão cria ou atualiza a execução da atividade de forma idempotente; repetição da mesma ação não cria duplicatas.
- Ao concluir, pedir minutos reais explicitamente (inteiro 0–480, default sugerido igual ao planejado, mas nunca contar esse valor sem confirmação). `0` é permitido para registrar conclusão sem tempo medido; exibir como '0 min registrados', não como tempo planejado.
- Guardar `completed_at` como `timestamptz` no momento real da conclusão. `planned_date` é calculada a partir de `week_start + day`; não substituí-la por `completed_at`.
- Reabrir deve preservar o histórico e os minutos registrados. Se o esquema atual não suportar reabertura sem apagar dados, adicionar campo de estado e timestamp de reabertura ou uma estrutura mínima equivalente em migração incremental, após justificar no plano. A atividade reaberta deixa de contar como concluída; minutos efetivamente registrados continuam auditáveis, mas não devem ser duplicados.
- A conclusão novamente atualiza o mesmo registro de execução, com novo `completed_at` e minutos confirmados. Sem criação de múltiplas sessões para a mesma atividade no MVP.
- Edição e conclusão devem mostrar erros claros e manter UI consistente após falha de rede; evitar contagem otimista irreconciliável.

### 2.4 Dashboard

- Preservar indicadores existentes de aulas, músicas, vocabulário e revisões, sem inventar dados.
- Adicionar apenas: **atividades concluídas na semana** (quantidade de atividades com execução ativa concluída), **minutos efetivamente registrados na semana** (soma dos minutos de execuções concluídas naquela semana), e **progresso semanal** (concluídas / planejadas, ou 0% quando não há atividades, com legenda indicando ausência de plano).
- Agregar por semana planejada, não por dia de conclusão. Uma atividade planejada na segunda e concluída na terça pertence à semana do planejamento.
- Não inferir nível CEFR ou atribuir notas com base no tempo estudado.

## 3. Plano padrão inicial (somente segunda-feira)

Semana atual do usuário no momento em que ele clicar em 'Criar meu plano inicial'. Dia 1 (segunda):

| Ordem | Categoria | Título | Conteúdo | Minutos |
|---|---|---|---|---:|
| 1 | grammar | Apresentando-se — Gramática | I am / You are / He is / She is; contrações I'm, you're, he's. | 15 |
| 2 | vocabulary | Apresentando-se — Vocabulário | name, age, city, country, job, student, happy, tired. | 10 |
| 3 | listening | Apresentando-se — Listening | Ouça um diálogo de apresentação A1 do British Council. | 15 |
| 4 | speaking | Apresentando-se — Speaking | Escreva 8 frases sobre você e leia cada uma em voz alta. | 10 |
| 5 | review | Apresentando-se — Revisão | Revise o conteúdo, escreva 3 frases novas e confira os erros. | 10 |

Total: 60 minutos planejados. Não incluir links específicos de áudio sem fonte confirmada. Os dias 2–7 ficam vazios, editáveis.

## 4. Interface e UX

- `/schedule`: cabeçalho com intervalo da semana, Anterior / Hoje / Próxima; resumo (previsto, concluído, minutos reais); sete dias acessíveis no desktop e mobile.
- Em cada dia: lista ordenada de atividades, categoria, descrição, duração prevista, status, minutos reais quando existentes, ações Editar / Concluir ou Reabrir / Excluir quando permitido.
- Formulário acessível de criação/edição com validação inline; confirmação explícita para exclusão; diálogo para informar minutos reais na conclusão.
- Estados: carregando, semana sem plano, plano vazio, erro de rede, ação em progresso e sucesso sem toast enganoso.
- Navegação por teclado, foco visível, labels, mensagens de erro e aria quando necessário. Sem overflow horizontal a 375px. Não exibir conteúdo inventado nos dias vazios.
- Ações devem ficar desabilitadas durante requisições duplicadas. Datas e horários exibidos no fuso do usuário.

## 5. SQL de referência — NÃO APLICAR SEM INSPECIONAR ET-001

A ET-001 já criou `study_plans`, `study_activities` e `study_sessions`, com FKs compostas e RLS. A ET-002 deve **reutilizá-las**. O SQL a seguir é uma referência de migração incremental; nomes/colunas podem diferir no banco real. O agente deve produzir uma nova migração com as alterações mínimas necessárias.

```sql
-- EXEMPLO CONDICIONAL. Confirmar nomes, tipos e constraints existentes.
-- A unicidade de semana deve usar a coluna real de data e o owner real.
ALTER TABLE public.study_plans
  ADD CONSTRAINT study_plans_user_week_unique UNIQUE (user_id, week_start);

-- Uma execução por atividade; só aplicar se a ET-001 ainda não tiver unicidade equivalente.
-- Se activity_id for opcional e houver sessões independentes, UNIQUE permite múltiplos NULL.
CREATE UNIQUE INDEX study_sessions_one_per_activity
  ON public.study_sessions (user_id, activity_id)
  WHERE activity_id IS NOT NULL;

-- Apenas se faltar uma coluna explícita para estado de reabertura:
ALTER TABLE public.study_sessions
  ADD COLUMN is_completed boolean NOT NULL DEFAULT true;

-- Opcional apenas se necessário para preservar a última reabertura:
ALTER TABLE public.study_sessions
  ADD COLUMN reopened_at timestamptz;
```

**Obrigatório antes de executar:** confirmar se a ET-001 já possui constraints equivalentes, se `completed_at` permite NULL, como o estado de conclusão é representado e como o usuário é vinculado às sessões. Evitar duplicar índices e constraints. Não aplicar `ALTER TABLE ... ADD CONSTRAINT` em banco com dados sem primeiro verificar colisões; não apagar dados para corrigir colisões.

### 5.1 RLS e grants

- Manter RLS ativo em todas as tabelas. Revisar policies existentes e adicionar somente o mínimo para `INSERT`, `UPDATE` e `DELETE` nas três tabelas do cronograma, sempre `TO authenticated` com `USING (user_id = (select auth.uid()))` e `WITH CHECK (user_id = (select auth.uid()))` quando aplicável.
- FKs compostas devem garantir que atividades pertençam ao plano do mesmo usuário e sessões pertençam à atividade do mesmo usuário. RLS sozinho não substitui integridade referencial.
- `profiles` continua sem mudança de propriedade. Nenhuma função `SECURITY DEFINER` adicional sem justificativa e aprovação.
- Verificar grants efetivos de tabelas e sequências (se houver) ao executar localmente. Não usar service_role no frontend; testes de administração podem usar service_role somente em Node, isoladamente.
- Se for necessário inserir plano + cinco atividades atomicamente, preferir uma função SQL `SECURITY INVOKER` com `auth.uid()` e validação do dono, ou mecanismo equivalente que preserve atomicidade. Não usar `SECURITY DEFINER` por conveniência. A função deve ser idempotente sob chamadas concorrentes e não alterar plano já existente.

### 5.2 Integridade e exclusão

- Não usar `ON DELETE CASCADE` para apagar histórico de sessões em exclusão de atividade; impedir exclusão se houver execução, inclusive reaberta.
- Respeitar comportamento já validado da ET-001 para FKs opcionais com `ON DELETE SET NULL (activity_id)` e preservação de `user_id`; não modificar sem justificativa. Se o requisito de impedir exclusão conflitar com a FK atual, aplicar proteção explícita mínima (por exemplo, trigger de bloqueio), sem reescrever a estrutura existente.
- Garantir unicidade de plano por semana e de execução por atividade; operações de conclusão/reabertura devem ser idempotentes e protegidas contra corrida.

## 6. Organização de código esperada

Reutilizar `src/features/schedule/`, `src/features/dashboard/`, `src/lib/supabase.ts`, providers e componentes UI existentes. Criar componentes e hooks pequenos quando necessário, por exemplo `WeekNavigation`, `DayColumn`, `ActivityForm`, `CompleteActivityDialog`, `scheduleService` e `useWeeklySchedule`. Nomes podem ser adaptados às convenções do repositório. Não introduzir Redux, Zustand, backend dedicado, cron jobs ou bibliotecas de calendário pesadas.

Usar queries tipadas e evitar carregar todas as semanas para calcular uma semana. Agregações devem ser consistentes com o estado de execução; atualizar dashboard após mutações. Não duplicar regras de negócio entre componentes.

## 7. Testes obrigatórios

### 7.1 Unitários/integração de interface

1. Semana ISO começa na segunda; mudança de ano, mês e fuso `America/Cuiaba` sem deslocamento indevido.
2. Navegação anterior/hoje/próxima em saltos de sete dias.
3. Semana sem plano: zero real, estado vazio e ação explícita de criar plano.
4. Plano inicial cria exatamente cinco atividades de segunda e zero nos demais dias; segundo clique não duplica.
5. CRUD de atividades com validação de título, categoria, minutos, dia e ordem.
6. Conclusão com minutos confirmados; `0` permitido; não inferir minutos do planejado sem confirmação.
7. Repetir conclusão não duplica execução.
8. Reabrir preserva tempo e histórico, remove status de concluído; concluir novamente não duplica.
9. Atividade executada não pode ser excluída; atividade sem execução pode.
10. Alterar semana não muda atividades de outra semana.
11. Falha de API não é exibida como sucesso nem como zero inventado.
12. Dashboard soma apenas execuções concluídas e usa semana planejada.
13. UI sem overflow horizontal em 375px, com teclado e navegação acessíveis.

### 7.2 RLS e banco local

14. A não lê, insere, edita nem apaga plano/atividade/sessão de B.
15. A não associa atividade ao plano de B nem sessão à atividade de B (INSERT e UPDATE), com constraints verificáveis.
16. Anônimo não acessa tabelas nem executa funções privilegiadas.
17. Criação concorrente de plano inicial não duplica plano/atividades.
18. Unicidade de execução por atividade sob chamadas repetidas/concorrentes.
19. Exclusão de atividade com sessão é rejeitada sem perda de histórico.
20. Reabrir/concluir mantém `user_id` e timestamps consistentes.
21. `npm run db:reset` recria esquema e todos os testes RLS passam; seeds de teste são removidos/isolados.

Preservar e executar os 17 testes unitários e os 61 testes RLS reportados na ET-001, adaptando apenas se a mudança de contrato exigir. Nenhum teste existente pode ser excluído para fazer a suíte passar.

## 8. Comandos de validação

```bash
npm ci
npm run db:start
npm run db:reset
npm run lint
npm run typecheck
npm run test
npm run test:rls
npm run build
npm run dev
```

Usar scripts reais existentes; caso algum comando difira, documentar. Verificar o app em navegador autenticado e em 375px (preferir emulação de viewport real; iframe é evidência parcial, não substitui integralmente viewport móvel).

## 9. Critérios de aceite — bloqueantes

- [ ] Migração incremental aplicada com sucesso em Supabase local limpo.
- [ ] Nenhum dado da ET-001 foi perdido ou sobrescrito.
- [ ] Cronograma semanal navegável e editável.
- [ ] Plano inicial de segunda-feira criado somente por ação explícita, com 5 blocos e 60 min.
- [ ] Terça a domingo sem conteúdo inventado.
- [ ] Atividades podem ser criadas, editadas, movidas e excluídas somente se sem execução.
- [ ] Conclusão/reabertura persistentes, idempotentes e com minutos reais explícitos.
- [ ] Histórico de execução preservado; nenhuma exclusão implícita.
- [ ] Dashboard exibe métricas reais da semana, sem dados simulados.
- [ ] RLS e integridade validados com duas contas e tentativas cruzadas.
- [ ] Login, logout e rotas protegidas da ET-001 continuam funcionando.
- [ ] Sem overflow horizontal a 375px e controles acessíveis.
- [ ] Lint, typecheck, testes, RLS e build passam.
- [ ] README atualizado com uso, migrações e comandos de teste.
- [ ] Nenhum commit, push, deploy ou mudança remota.

## 10. Relatório final obrigatório

Fornecer: (a) arquivos criados/alterados; (b) esquema efetivo e SQL de migração com explicação das diferenças frente à referência; (c) telas e regras implementadas; (d) resultados dos comandos e quantidade de testes; (e) evidências dos critérios de aceite; (f) pendências e riscos; (g) confirmação de que não houve commit/push/deploy e nenhuma funcionalidade fora do escopo. **Não declarar concluído se qualquer critério bloqueante não foi validado. Não iniciar ET-003.**
