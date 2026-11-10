# ET-003 — Banco de Vocabulário, Flashcards e Repetição Espaçada

**Projeto:** My English Journey  
**Status:** Especificação para análise prévia do Claude Code — implementação NÃO autorizada automaticamente  
**Versão:** 1.0 — 10/11/2026  
**Dependências:** ET-001 e ET-002 concluídas

## 1. Objetivo

Permitir ao único usuário do aplicativo cadastrar e organizar vocabulário em inglês com tradução para português e dois exemplos, estudar flashcards e registrar revisões com agendamento determinístico. Persistir tudo no Supabase local com isolamento RLS. Integrar contagens reais ao dashboard sem alterar os contratos da ET-001/002.

## 2. Escopo fechado

**Incluído:** CRUD de vocabulário; busca textual e filtros simples; flashcards frente/verso; fila de revisões vencidas; avaliação Errei/Difícil/Bom/Fácil; agendamento; histórico mínimo de avaliações; estados de carregamento/erro/vazio; indicadores reais no dashboard; testes unitários, integração SQL/RLS e E2E em 375px e desktop; documentação.

**Excluído:** importação de relatórios ou dados das aulas 01–03; extração automática de letras; IA, tradução automática, TTS, áudio, imagens, gamificação, notificações, lembretes, PWA, gráficos avançados, mudanças no cronograma, publicação, commit/push e deploy. Não inserir vocabulário fictício no banco do usuário.

## 3. Pré-condição obrigatória: inspeção do esquema real

Antes de escrever código, ler ET-001 e ET-002, migrações, tipos gerados, componentes, testes, README e políticas/grants. Inspecionar particularmente `vocabulary`, `vocabulary_reviews`, `lessons`, `music_studies`, seus FKs compostos, triggers de `source_ref`, índices, checks, colunas de agendamento, políticas RLS e permissões. **Não presumir** que os nomes e tipos abaixo já existem. Elaborar matriz de mapeamento entre requisitos e colunas reais, apresentar SQL incremental proposto e aguardar aprovação. Se a estrutura existente permitir cumprir o requisito sem alterações, reutilizá-la. Não modificar migrações antigas.

## 4. Regras de vocabulário

1. Cada registro pertence a `auth.uid()` e só pode ser lido/modificado por seu dono.
2. Campos obrigatórios: palavra/expressão em inglês (`term` lógico), tradução em português (`translation` lógico), exemplo 1 e exemplo 2 em inglês. Nomes físicos devem respeitar esquema real. Não adicionar campos duplicados quando já houver equivalentes.
3. Limites: termo 1–120 caracteres, tradução 1–240, cada exemplo 1–500; trim antes de validar e persistir. Exemplos podem ser frases completas; não impor análise linguística automática.
4. Campos opcionais: categoria simples (quando já suportada ou justificada), notas, origem (`manual`, `lesson`, `music`) e referência compatível. Não criar novas entidades de origem. O cadastro manual funciona sem origem. Se origem referenciada for selecionada, validar propriedade do recurso no banco usando o mecanismo da ET-001; não permitir vincular recursos de outro usuário.
5. Duplicatas: a mesma palavra/expressão normalizada (trim + case-insensitive) não deve ser cadastrada duas vezes pelo mesmo usuário. Usuários diferentes podem cadastrar a mesma palavra. Para termos já existentes, orientar edição; não sobrescrever silenciosamente. Inspecionar collation/normalização e definir estratégia SQL antes de implementá-la. Não eliminar registros existentes automaticamente.
6. Editar palavra, tradução ou exemplos preserva o histórico de revisões. Uma edição não altera automaticamente a data da próxima revisão. Excluir uma palavra com histórico requer confirmação explícita e política de retenção/deleção documentada e aprovada **antes** de implementar; por padrão, preferir bloqueio de exclusão se houver histórico, em consonância com ET-002.
7. Busca por termo/tradução, filtros `Todas`, `Pendentes`, `Sem revisão` e ordenação previsível. Não depender de dados artificiais.
8. Paginação ou limite incremental simples para evitar leitura ilimitada; não implementar busca full-text avançada.

## 5. Flashcards e revisão

- Frente: palavra/expressão em inglês. Verso, revelado mediante ação explícita: tradução e dois exemplos em inglês. Nunca mostrar avaliação antes de revelar o verso.
- Navegação por teclado e botões acessíveis; estados de fila vazia e fim da sessão. Evitar dupla submissão enquanto a revisão está salvando.
- A fila contém apenas palavras do usuário com revisão vencida (`next_review_at <= now()`) e palavras ainda não revisadas. Ordenação estável: vencidas mais antigas primeiro, depois novas por data de criação e ID. Definir se o esquema atual representa novas palavras com `next_review_at` nulo; não duplicar fonte de verdade.
- Um item respondido sai da fila atual quando salvo. Ao atualizar a página, o próximo item deve ser consistente com o estado persistido. Em caso de falha, não avançar a carta nem exibir sucesso falso.
- Horários de revisão são instantes `timestamptz` em UTC; exibição em `America/Cuiaba`. O fuso não altera os intervalos de horas.

### 5.1 Algoritmo MVP determinístico

O agendamento é baseado no **estado atual** da palavra, armazenado no banco, e no resultado da resposta. Evitar implementar SM-2/FSRS sem solicitação. Se o esquema atual já possui parâmetros compatíveis, reutilizar ou migrar preservando dados. Regras:

| Resposta | Código | Intervalo seguinte | Evolução |
|---|---|---|---|
| Errei | `again` | 10 minutos | reinicia sequência de acertos para 0 |
| Difícil | `hard` | 1 dia | mantém sequência de acertos sem incrementar |
| Bom | `good` | sequência 0→1 dia; 1→3 dias; 2→7 dias; 3→14 dias; 4+→30 dias | incrementa sequência em 1 |
| Fácil | `easy` | sequência 0→3 dias; 1→7 dias; 2→14 dias; 3+→30 dias | incrementa sequência em 1 |

`sequência` = número inteiro não negativo de respostas `good` ou `easy` consecutivas desde o último `again`, com `hard` sem avanço. Limitar sequência a 100. Todos os intervalos são relativos ao horário do servidor no instante de confirmação; 1 dia = 24 horas. Persistir data de revisão, resposta, intervalo e estado resultante conforme compatibilidade com o esquema. A UI não calcula datas autoritativas. O servidor decide em uma transação atômica.

**Idempotência e concorrência:** uma submissão deve ter ID de requisição único gerado pelo cliente e aceito pela RPC, para que retries da mesma submissão não criem revisões duplicadas. Concorrência de duas submissões diferentes sobre o mesmo cartão deve ser serializada (lock da palavra) e rejeitar estado obsoleto ou aplicar regra de versão/`expected_next_review_at` documentada. Não usar apenas duas escritas independentes pelo frontend. Se a implementação de chave idempotente exigir nova coluna, justificar e migrar. Testar chamadas concorrentes.

**Importante:** o algoritmo é uma regra de produto MVP, não uma afirmação de eficácia pedagógica cientificamente validada. Documentar que poderá ser substituído em etapa futura.

## 6. Contrato de dados e SQL incremental

Criar `supabase/migrations/20261110xxxx_vocabulary_review.sql` (usar timestamp não conflitante com migrações existentes). A migração deve ser **aditiva**, com pré-checagens para dados existentes e sem editar arquivos SQL da ET-001/002. Não executar SQL destrutivo. Planejar:

- Campos de vocabulário: termo, tradução, exemplos e metadados de revisão, reutilizando os existentes sempre que possível.
- Índice de unicidade por usuário e termo normalizado, após verificar duplicatas existentes.
- Estado de sequência de acertos e `next_review_at` no local apropriado; tipos e constraints coerentes.
- Histórico de revisões em `vocabulary_reviews`, com FK composta garantindo mesmo proprietário; preservar a semântica de quaisquer campos existentes.
- Chave idempotente única por usuário/requisição; sem permitir trocar `user_id` ou `vocabulary_id` após criar uma revisão.
- RPC transacional `submit_vocabulary_review(...)` (nome final sujeito ao esquema) com `SECURITY INVOKER`, `SET search_path = ''`, objetos totalmente qualificados, `auth.uid()` obrigatório, validação de propriedade, lock e verificação de estado; `REVOKE EXECUTE FROM PUBLIC, anon` e `GRANT EXECUTE TO authenticated`.
- CRUD via cliente autenticado com RLS existente, sem `service_role` no frontend. Revisar grants para evitar `TRUNCATE`, `TRIGGER`, `REFERENCES` e operações que contornem regras; revogar INSERT/UPDATE/DELETE direto em histórico de revisões se somente a RPC deve escrevê-lo, verificando como isso interage com SECURITY INVOKER. **Atenção:** uma função SECURITY INVOKER não consegue escrever em tabela se o invocador não tiver o privilégio correspondente; resolver explicitamente o conflito sem trocar silenciosamente para SECURITY DEFINER. Apresentar solução ao usuário antes de implementar caso necessário.
- Triggers e FKs existentes de origem devem permanecer funcionais. Não modificar regras de exclusão de ET-002.
- Testes devem provar que o cliente não forja revisões/histórico, não troca dono e não referencia palavras de outra conta.

## 7. Interface e navegação

Reutilizar rotas `/vocabulary` e `/reviews`, layout, AuthProvider, componentes e padrões visuais existentes. Não criar novo sistema de autenticação.

**/vocabulary:** contador real, botão `Adicionar palavra`, lista com termo, tradução, origem e status de revisão, busca/filtros, ações editar e excluir com confirmação. Formulário com termo, tradução, dois exemplos obrigatórios; feedback de validação e erro do servidor. No mobile, cards empilhados, sem overflow horizontal.

**/reviews:** resumo de pendências, flashcard acessível, botão `Mostrar resposta`, opções Errei/Difícil/Bom/Fácil, progresso da sessão (número respondido nesta sessão, não estatística inventada), estado de conclusão e tratamento de falhas. Ao finalizar, oferecer voltar ao vocabulário; não enviar notificações.

**/dashboard:** manter indicadores anteriores e atualizar contagem de palavras e revisões pendentes a partir do banco. Não converter erros em zeros; preservar indicadores do cronograma. Se necessário, acrescentar link para `/reviews` sem duplicar métricas.

## 8. Testes obrigatórios

### 8.1 Unitários / componentes

1. Validação de termo, tradução e dois exemplos, inclusive limites e espaços.
2. Cadastro, edição e busca/filtros; duplicata apresenta erro compreensível.
3. Frente/verso e botões de avaliação só após revelar.
4. Loading, vazio, erro de consulta e erro de submissão sem avanço indevido.
5. Navegação por teclado e foco em diálogos.
6. Dashboard preserva métricas anteriores e não mostra zero falso.
7. Cálculo determinístico de cada resposta e sequência (se lógica compartilhada, sem criar segunda fonte autoritativa).

### 8.2 SQL/RLS em Supabase local

8. Migração do zero (`db:reset`) e incremental sobre ET-002 com dados, sem perda.
9. Dois usuários: isolamento CRUD, FKs e RPC; `anon` sem acesso à RPC.
10. Unicidade por usuário; mesma palavra permitida em contas diferentes.
11. Origem manual/lesson/music: integridade e propriedade.
12. Histórico e agendamento em uma única transação; erro não deixa estado parcial.
13. Idempotência de retry com mesma chave; concorrência com chaves diferentes.
14. Errei/Difícil/Bom/Fácil em diferentes estados de sequência, limites e horários.
15. Impedir inserção ou alteração fraudulenta de histórico e propriedade.
16. Exclusão com e sem histórico conforme regra expressamente aprovada.
17. Nenhuma regressão nos testes RLS da ET-001/002.

### 8.3 E2E navegador

18. Login real local, adicionar palavra, editar, pesquisar, revelar flashcard, avaliar, recarregar e conferir persistência no banco.
19. Testar fila vencida e não vencida com tempo controlado no ambiente de teste (sem sleeps longos nem manipulação de produção).
20. Confirmar que falha de rede/servidor não avança cartão.
21. Viewport móvel real 375px e desktop 1280px, sem overflow; teclado e foco.
22. Rotas protegidas, logout e estados vazios; não apagar testes anteriores.

### 8.4 Comandos

`npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:rls`, `npm run build`, e E2E pelo mecanismo de validação adotado na ET-002. Se `db:reset` for necessário, confirmar alvo local e autorização; ele destrói dados locais. Não realizar em remoto. Registrar contagens antes/depois e resultados reais.

## 9. Critérios de aceite

- [ ] CRUD funcional de palavras com dois exemplos obrigatórios, busca e filtros.
- [ ] Nenhuma duplicata por usuário; isolamento entre usuários.
- [ ] Flashcards acessíveis e avaliação apenas após revelar resposta.
- [ ] As quatro avaliações produzem exatamente os intervalos e estados da tabela.
- [ ] Revisões e agendamento persistem atomicamente; retries não duplicam.
- [ ] Fila de revisões vencidas/novas correta e consistente após reload.
- [ ] RLS e privilégios impedem acesso cruzado e fraude de histórico.
- [ ] Dashboard mostra métricas reais, sem regressão da ET-002.
- [ ] Migração incremental e `db:reset` local aprovados, com preservação de dados na via incremental.
- [ ] Testes existentes + novos passando; build, lint e typecheck sem falhas.
- [ ] Sem overflow a 375px; acessibilidade básica e estados de erro.
- [ ] README e `.env.example` atualizados se necessário; sem segredos no bundle.
- [ ] Nenhuma funcionalidade fora do escopo, nenhum commit/push/deploy/remoto.

## 10. Processo e entregáveis do Claude Code

**Fase A — somente análise (obrigatória):** inspecionar repositório e banco; fornecer mapeamento do esquema real, plano de arquivos, SQL proposto, tratamento da tensão SECURITY INVOKER × privilégios de escrita, política de exclusão com histórico, estratégia de concorrência/idempotência, riscos e estimativa de testes. **Aguardar aprovação literal. Não modificar arquivos nessa fase.**

**Fase B — após aprovação:** implementar exclusivamente ET-003, validar e entregar relatório com arquivos, alterações SQL, resultados por comando, evidências RLS/E2E, ressalvas e instruções de uso. Não executar commit, push, deploy nem tocar Supabase remoto.

**Observação de projeto:** a ET-003 não deve depender de dados históricos do ChatGPT; palavras reais serão cadastradas manualmente nesta etapa. Não alterar a política de exclusão de conta com histórico definida na ET-002.
