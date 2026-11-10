# ET-001 — My English Journey — Fundação técnica

Data: 2026-11-09. Status: especificação para execução, não implementada.

## Objetivo
Construir a fundação local de um site pessoal responsivo com React, TypeScript, Vite, Tailwind, Supabase Auth e PostgreSQL, com nove tabelas protegidas por RLS, layout e rotas privadas. Não implementar funcionalidades de etapas posteriores.

## Escopo permitido
- Inicialização do projeto Vite React TS e Tailwind, React Router, Lucide, Supabase JS.
- Login e logout com email/senha; sessão persistida e rota privada.
- Cadastro público desabilitado no painel Supabase (documentar procedimento, sem fingir configurar remotamente).
- Migração SQL idempotência por execução única no sistema de migrações, constraints, índices e RLS.
- Dashboard com perfil real e contagens reais, zeros quando vazio; páginas restantes somente placeholders.
- Testes de autenticação, rotas, estados vazios e políticas RLS (teste integrado documentado).
- README, env.example, lint, typecheck, build.

## Fora do escopo
Flashcards, revisão espaçada, cadastro de vocabulário, execução de cronograma, importação histórica, gráficos, IA, notificações, PWA, deploy, backend dedicado, geração de dados inventados.

## Stack
Node LTS, React, TypeScript, Vite, Tailwind CSS, React Router, @supabase/supabase-js, lucide-react, Vitest e Testing Library. Fixar versões no package-lock.json.

## Rotas
/login pública; /dashboard, /schedule, /lessons, /vocabulary, /reviews, /music, /progress privadas. Redirecionar / para /dashboard se autenticado ou /login caso contrário. Outras rotas: 404. Páginas futuras apenas título e descrição.

## Estrutura sugerida
```
src/app/{router.tsx,providers.tsx}
src/components/{layout,ui}/
src/features/{auth,dashboard,schedule,lessons,vocabulary,reviews,music,progress}/
src/lib/supabase.ts
src/main.tsx
supabase/migrations/202611090001_initial.sql
.env.example
README.md
```

## Migração SQL — referência executável

```sql
create extension if not exists pgcrypto;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  current_level text not null default 'A1' check (current_level in ('A1','A2','B1','B2','C1','C2')),
  daily_goal_minutes integer not null default 60 check (daily_goal_minutes between 1 and 1440),
  created_at timestamptz not null default now()
);

create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  week_start date not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.study_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  plan_id uuid not null references public.study_plans(id) on delete cascade,
  study_day date not null,
  skill text not null check (skill in ('grammar','vocabulary','listening','speaking','writing','review')),
  title text not null,
  planned_minutes integer not null check (planned_minutes between 1 and 1440),
  created_at timestamptz not null default now()
);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  activity_id uuid references public.study_activities(id) on delete set null,
  completed_at timestamptz not null default now(),
  actual_minutes integer not null check (actual_minutes between 0 and 1440),
  notes text
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  lesson_number integer not null check (lesson_number > 0),
  studied_on date,
  topics text[] not null default '{}',
  report text,
  source_key text,
  created_at timestamptz not null default now(),
  unique (user_id, lesson_number),
  unique (user_id, source_key)
);

create table public.vocabulary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  word text not null,
  translation text not null,
  part_of_speech text,
  example_1 text not null,
  example_1_translation text,
  example_2 text not null,
  example_2_translation text,
  source_type text check (source_type in ('lesson','music','manual')),
  source_ref uuid,
  next_review_at timestamptz,
  review_interval_days integer not null default 0 check (review_interval_days >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, word)
);

create table public.vocabulary_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  rating text not null check (rating in ('again','hard','good','easy')),
  reviewed_at timestamptz not null default now()
);

create table public.music_studies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  song text not null,
  artist text not null,
  studied_on date,
  initial_comprehension text,
  final_comprehension text,
  difficulties text[] not null default '{}',
  report text,
  source_key text,
  created_at timestamptz not null default now(),
  unique (user_id, source_key)
);

create table public.skill_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  skill text not null check (skill in ('grammar','vocabulary','listening','speaking','writing','reading','pronunciation')),
  score numeric(6,2),
  score_max numeric(6,2),
  assessment_date date not null,
  lesson_id uuid references public.lessons(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  check ((score is null and score_max is null) or (score is not null and score_max is not null and score_max > 0 and score >= 0 and score <= score_max))
);

-- Proteger a relação de propriedade em referências cruzadas, mesmo se futuras policies mudarem.
create unique index study_plans_owner_id_idx on public.study_plans(user_id,id);
create unique index study_activities_owner_id_idx on public.study_activities(user_id,id);
create unique index vocabulary_owner_id_idx on public.vocabulary(user_id,id);
create unique index lessons_owner_id_idx on public.lessons(user_id,id);

alter table public.study_activities add constraint activities_owner_plan_fk foreign key (user_id,plan_id) references public.study_plans(user_id,id) on delete cascade;
alter table public.study_sessions add constraint sessions_owner_activity_fk foreign key (user_id,activity_id) references public.study_activities(user_id,id);
alter table public.vocabulary_reviews add constraint reviews_owner_word_fk foreign key (user_id,vocabulary_id) references public.vocabulary(user_id,id) on delete cascade;
alter table public.skill_assessments add constraint assessments_owner_lesson_fk foreign key (user_id,lesson_id) references public.lessons(user_id,id);

create index study_activities_day_idx on public.study_activities(user_id,study_day);
create index study_sessions_completed_idx on public.study_sessions(user_id,completed_at);
create index vocabulary_due_idx on public.vocabulary(user_id,next_review_at);
create index vocabulary_reviews_date_idx on public.vocabulary_reviews(user_id,reviewed_at);
create index music_studies_date_idx on public.music_studies(user_id,studied_on);
create index assessments_date_idx on public.skill_assessments(user_id,assessment_date);

-- Criar perfil no primeiro login sem depender de permissões INSERT abertas ao cliente.
create or replace function public.create_my_profile()
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare result public.profiles;
begin
  insert into public.profiles (user_id) values (auth.uid())
  on conflict (user_id) do nothing;
  select * into result from public.profiles where user_id = auth.uid();
  return result;
end;
$$;
revoke all on function public.create_my_profile() from public;
grant execute on function public.create_my_profile() to authenticated;

-- Não habilitar políticas permissivas de criação de perfis para o cliente.
do $$
declare tbl text;
begin
  foreach tbl in array array['profiles','study_plans','study_activities','study_sessions','lessons','vocabulary','vocabulary_reviews','music_studies','skill_assessments'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',tbl||'_select_own',tbl);
    if tbl <> 'profiles' then
      execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',tbl||'_insert_own',tbl);
      execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',tbl||'_update_own',tbl);
      execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',tbl||'_delete_own',tbl);
    else
      execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',tbl||'_update_own',tbl);
    end if;
  end loop;
end $$;
```

### Observação de segurança para o agente
As tabelas têm colunas `user_id` e políticas RLS. Verificar no teste integrado que referências cruzadas não podem apontar para recursos de outro usuário. A função `create_my_profile` é SECURITY DEFINER e deve ser revisada para que somente a conta autenticada consiga criar seu próprio perfil; `auth.uid()` nulo não deve produzir inserção válida. Não usar `service_role` no frontend. Em produção, revisar grants, search_path, privilégios de função e comportamento do SQL Editor antes do deploy.

## Autenticação e UI
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em `.env.example` sem valores secretos.
- `createClient` em src/lib/supabase.ts; nunca usar service role.
- Provider de autenticação com estado loading, sessão, listener onAuthStateChange e cleanup.
- Login com email/senha e mensagens genéricas, estado loading, sem cadastro.
- Ao autenticar, invocar RPC create_my_profile e carregar perfil; falha deve aparecer como erro, não criar perfil local falso.
- Layout: sidebar desktop, navegação adaptada para mobile, topo com nome e logout; foco acessível, estados vazios e de carregamento.
- Dashboard: nível do perfil, meta diária, contagens de lessons/music_studies/vocabulary e revisões pendentes (vocabulary.next_review_at <= agora); zeros quando vazio. Não preencher com dados históricos ainda.

## Comandos de inicialização sugeridos
```bash
npm create vite@latest my-english-journey -- --template react-ts
cd my-english-journey
npm install
npm install @supabase/supabase-js react-router-dom lucide-react
npm install tailwindcss @tailwindcss/vite
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm run dev
```
O agente deve configurar Tailwind no vite.config.ts, importar CSS e criar scripts lint, typecheck, test, build.

## Testes obrigatórios
1. Visitante em /dashboard vai para /login.
2. Usuário autenticado visita /dashboard.
3. Logout elimina acesso à rota privada.
4. Reload preserva sessão válida.
5. Erro de credenciais exibe mensagem sem detalhes sensíveis.
6. Dashboard vazio exibe zeros reais.
7. Teste integrado RLS com duas contas distintas: usuário A não lê, altera ou apaga dados de B; A não vincula filho a recurso de B; anônimo não lê dados.
8. Layout sem overflow horizontal em viewport móvel.
9. npm run lint, npm run typecheck, npm run test e npm run build passam.

## Entrega do agente
Ao final: resumo de arquivos criados, comandos executados, resultados dos testes, migrações aplicadas ou pendentes, variáveis necessárias, pendências manuais no Supabase e evidência de que nenhuma funcionalidade futura foi implementada. Não declarar testes de RLS como aprovados sem rodá-los contra Supabase de teste.

## Critérios de aceite
- Projeto sobe com npm run dev após configurar .env.
- Login e logout funcionam com usuário previamente provisionado.
- Rotas privadas e layout responsivo.
- Nove tabelas criadas, RLS habilitado, teste multiusuário realizado.
- Dashboard com valores reais ou zeros.
- README reproduz instalação local.
- Nenhuma funcionalidade futura implementada.

## Histórico para etapa futura (não inserir agora)
Aulas 01, 02, 03 e estudo Count on Me; aguardar relatórios completos para notas e datas verificáveis. Nenhum dado fictício.
