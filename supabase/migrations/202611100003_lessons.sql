-- ET-004 — Registro de aulas e exercícios
-- Migração INCREMENTAL e aditiva (não altera migrações anteriores).
--
--  * Reutiliza public.lessons: lesson_number (número), studied_on (data), topics (assuntos),
--    report (observações). Acrescenta: title, level, status, difficulties, recommendations.
--  * Novas tabelas pequenas: lesson_blocks (um bloco por tipo e aula, com nota 0–10) e
--    lesson_exercises (exercícios de cada bloco). FKs compostas (user_id, …) garantem o mesmo dono.
--  * skill_assessments (ET-001) não é usada aqui: não aceita "revisão" e representa avaliações
--    de habilidade para uma etapa futura de progresso.
--  * Nota geral da aula: calculada na aplicação (média simples das notas dos blocos avaliados);
--    não é armazenada, para não haver duas fontes de verdade.
--  * Sem funções novas, sem SECURITY DEFINER, sem triggers.

-- 1. lessons --------------------------------------------------------------------------------------
alter table public.lessons
  add column title text,
  add column level text,
  add column status text not null default 'in_progress',
  add column difficulties text,
  add column recommendations text;

alter table public.lessons
  add constraint lessons_title_len check (title is null or char_length(btrim(title)) between 1 and 200),
  add constraint lessons_level_check check (level is null or level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  add constraint lessons_status_check check (status in ('in_progress', 'completed')),
  add constraint lessons_topics_max check (cardinality(topics) <= 30),
  add constraint lessons_report_len check (report is null or char_length(report) <= 5000),
  add constraint lessons_difficulties_len check (difficulties is null or char_length(difficulties) <= 5000),
  add constraint lessons_recommendations_len check (recommendations is null or char_length(recommendations) <= 5000);

create index lessons_status_idx on public.lessons (user_id, status, lesson_number);

-- 2. lesson_blocks -------------------------------------------------------------------------------
create table public.lesson_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  lesson_id uuid not null,
  block_type text not null check (block_type in ('grammar', 'vocabulary', 'listening', 'speaking', 'reading', 'writing', 'review')),
  score numeric(3, 1) check (score is null or (score >= 0 and score <= 10)),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique (lesson_id, block_type),
  -- O bloco pertence a uma aula do MESMO usuário; excluir a aula exclui seus blocos.
  constraint lesson_blocks_owner_lesson_fk
    foreign key (user_id, lesson_id) references public.lessons (user_id, id) on delete cascade
);
create unique index lesson_blocks_owner_id_idx on public.lesson_blocks (user_id, id);

-- 3. lesson_exercises ----------------------------------------------------------------------------
create table public.lesson_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  block_id uuid not null,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 4000),
  my_answer text check (my_answer is null or char_length(my_answer) <= 4000),
  corrected_answer text check (corrected_answer is null or char_length(corrected_answer) <= 4000),
  explanation text check (explanation is null or char_length(explanation) <= 4000),
  created_at timestamptz not null default now(),
  -- O exercício pertence a um bloco do MESMO usuário; excluir o bloco exclui seus exercícios.
  constraint lesson_exercises_owner_block_fk
    foreign key (user_id, block_id) references public.lesson_blocks (user_id, id) on delete cascade
);
create index lesson_exercises_block_idx on public.lesson_exercises (block_id, created_at);

-- 4. RLS: somente o dono, como nas demais tabelas ------------------------------------------------
do $$
declare tbl text;
begin
  foreach tbl in array array['lesson_blocks', 'lesson_exercises'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', tbl || '_select_own', tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', tbl || '_insert_own', tbl);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', tbl || '_update_own', tbl);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', tbl || '_delete_own', tbl);
  end loop;
end $$;

-- 5. Grants: anon sem acesso; TRUNCATE (ignora RLS) e afins revogados -----------------------------
revoke all on public.lessons, public.lesson_blocks, public.lesson_exercises from anon;
revoke truncate, trigger, references on public.lessons, public.lesson_blocks, public.lesson_exercises from authenticated;
