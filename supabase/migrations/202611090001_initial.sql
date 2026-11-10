-- ET-001 — My English Journey — migração inicial
-- Base: SQL de referência da ET-001, com os ajustes aprovados:
--   1. EXECUTE de create_my_profile revogado de PUBLIC e anon; concedido só a authenticated.
--   2. Verificação explícita de auth.uid() IS NULL em create_my_profile.
--   3. Trigger de integridade para vocabulary.source_ref (tipo + mesmo dono).
--   4. FKs compostas opcionais anulam apenas a coluna opcional (ON DELETE SET NULL (col)),
--      preservando user_id.
-- Executada uma única vez pelo sistema de migrações do Supabase (não é idempotente por design).

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

alter table public.study_activities add constraint activities_owner_plan_fk
  foreign key (user_id,plan_id) references public.study_plans(user_id,id) on delete cascade;
-- Ajuste 4: ao apagar a atividade/aula, anula apenas a coluna opcional; user_id é preservado.
alter table public.study_sessions add constraint sessions_owner_activity_fk
  foreign key (user_id,activity_id) references public.study_activities(user_id,id) on delete set null (activity_id);
alter table public.vocabulary_reviews add constraint reviews_owner_word_fk
  foreign key (user_id,vocabulary_id) references public.vocabulary(user_id,id) on delete cascade;
alter table public.skill_assessments add constraint assessments_owner_lesson_fk
  foreign key (user_id,lesson_id) references public.lessons(user_id,id) on delete set null (lesson_id);

create index study_activities_day_idx on public.study_activities(user_id,study_day);
create index study_sessions_completed_idx on public.study_sessions(user_id,completed_at);
create index vocabulary_due_idx on public.vocabulary(user_id,next_review_at);
create index vocabulary_reviews_date_idx on public.vocabulary_reviews(user_id,reviewed_at);
create index music_studies_date_idx on public.music_studies(user_id,studied_on);
create index assessments_date_idx on public.skill_assessments(user_id,assessment_date);
create index vocabulary_source_idx on public.vocabulary(user_id,source_type,source_ref);

-- Criar perfil no primeiro login sem depender de permissões INSERT abertas ao cliente.
create or replace function public.create_my_profile()
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result public.profiles;
begin
  -- Ajuste 2: sem usuário autenticado, nenhuma inserção é tentada.
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.profiles (user_id) values (uid)
  on conflict (user_id) do nothing;

  select * into result from public.profiles where user_id = uid;
  return result;
end;
$$;
-- Ajuste 1: o Supabase concede EXECUTE a anon por default privileges; revogar explicitamente.
revoke all on function public.create_my_profile() from public;
revoke all on function public.create_my_profile() from anon;
grant execute on function public.create_my_profile() to authenticated;

-- Ajuste 3: integridade de vocabulary.source_ref (referência polimórfica, sem FK nativa).
-- Regras:
--   source_type = 'manual' ou null  -> source_ref deve ser null;
--   source_type = 'lesson'          -> source_ref, se informado, deve ser uma lesson do mesmo user_id;
--   source_type = 'music'           -> source_ref, se informado, deve ser um music_study do mesmo user_id.
-- SECURITY DEFINER para que a checagem de dono não dependa da visibilidade RLS do chamador;
-- a comparação explícita com new.user_id garante o isolamento.
create or replace function public.check_vocabulary_source_ref()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.source_ref is null then
    return new;
  end if;

  if new.source_type is null or new.source_type = 'manual' then
    raise exception 'source_ref must be null when source_type is %', coalesce(new.source_type, 'null')
      using errcode = '23514';
  elsif new.source_type = 'lesson' then
    if not exists (select 1 from public.lessons l where l.id = new.source_ref and l.user_id = new.user_id) then
      raise exception 'source_ref does not reference a lesson owned by the same user'
        using errcode = '23503';
    end if;
  elsif new.source_type = 'music' then
    if not exists (select 1 from public.music_studies m where m.id = new.source_ref and m.user_id = new.user_id) then
      raise exception 'source_ref does not reference a music study owned by the same user'
        using errcode = '23503';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.check_vocabulary_source_ref() from public;
revoke all on function public.check_vocabulary_source_ref() from anon, authenticated;

create trigger vocabulary_source_ref_check
  before insert or update of user_id, source_type, source_ref on public.vocabulary
  for each row execute function public.check_vocabulary_source_ref();

-- Ao apagar a origem, anular a referência (equivalente a ON DELETE SET NULL da coluna).
create or replace function public.clear_vocabulary_source_ref()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.vocabulary v
     set source_ref = null
   where v.user_id = old.user_id
     and v.source_ref = old.id
     and v.source_type = tg_argv[0];
  return old;
end;
$$;
revoke all on function public.clear_vocabulary_source_ref() from public;
revoke all on function public.clear_vocabulary_source_ref() from anon, authenticated;

create trigger lessons_clear_vocabulary_source
  after delete on public.lessons
  for each row execute function public.clear_vocabulary_source_ref('lesson');

create trigger music_studies_clear_vocabulary_source
  after delete on public.music_studies
  for each row execute function public.clear_vocabulary_source_ref('music');

-- Impedir que a origem troque de dono enquanto referenciada (mantém a regra "mesmo usuário").
create or replace function public.prevent_source_owner_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
    if exists (select 1 from public.vocabulary v
                where v.user_id = old.user_id and v.source_ref = old.id and v.source_type = tg_argv[0]) then
      raise exception 'source is referenced by vocabulary and cannot change owner or id'
        using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_source_owner_change() from public;
revoke all on function public.prevent_source_owner_change() from anon, authenticated;

create trigger lessons_prevent_owner_change
  before update of user_id, id on public.lessons
  for each row execute function public.prevent_source_owner_change('lesson');

create trigger music_studies_prevent_owner_change
  before update of user_id, id on public.music_studies
  for each row execute function public.prevent_source_owner_change('music');

-- RLS: somente o dono acessa; profiles não tem INSERT/DELETE para o cliente (criação via RPC).
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
