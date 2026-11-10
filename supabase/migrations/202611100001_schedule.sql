-- ET-002 — Cronograma editável e acompanhamento diário
-- Migração INCREMENTAL sobre 202611090001_initial.sql (que não é alterada).
--
-- Diferenças frente ao SQL de referência da ET-002 (ver README/relatório):
--  * UNIQUE (user_id, week_start) já existe (study_plans_user_id_week_start_key): não duplicado.
--  * O dia da atividade é a coluna real study_day (DATE). Dia da semana = isodow(study_day)
--    (1 = segunda ... 7 = domingo); um trigger garante study_day dentro da semana do plano.
--  * Unicidade de execução: índice parcial em (activity_id) — mais estrito que (user_id, activity_id),
--    equivalente porque a FK composta já força activity.user_id = session.user_id.
--  * Estado de execução: is_completed + reopened_at (não existia representação de reabertura).
--  * Nenhuma função SECURITY DEFINER nova: todas são SECURITY INVOKER (RLS se aplica).
--
-- Pré-condições verificadas antes de qualquer constraint nova: a migração aborta (sem apagar
-- nada) se algum dado existente colidir com as novas regras.

-- ---------------------------------------------------------------------------------------------
-- 0. Verificação de colisões com os dados existentes
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.study_plans where extract(isodow from week_start) <> 1) then
    raise exception 'ET-002: há study_plans com week_start fora da segunda-feira; corrija manualmente antes de migrar';
  end if;
  if exists (select 1 from public.study_activities a join public.study_plans p on p.id = a.plan_id
              where a.study_day not between p.week_start and p.week_start + 6) then
    raise exception 'ET-002: há study_activities fora da semana do plano';
  end if;
  if exists (select 1 from public.study_activities where planned_minutes > 240) then
    raise exception 'ET-002: há study_activities com planned_minutes > 240';
  end if;
  if exists (select 1 from public.study_activities where char_length(btrim(title)) not between 1 and 120) then
    raise exception 'ET-002: há study_activities com título vazio ou > 120 caracteres';
  end if;
  if exists (select 1 from public.study_activities group by plan_id, study_day having count(*) > 30) then
    raise exception 'ET-002: há dias com mais de 30 atividades';
  end if;
  if exists (select 1 from public.study_sessions where actual_minutes > 480) then
    raise exception 'ET-002: há study_sessions com actual_minutes > 480';
  end if;
  if exists (select 1 from public.study_sessions where activity_id is not null
              group by activity_id having count(*) > 1) then
    raise exception 'ET-002: há atividades com mais de uma study_session';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. study_plans
-- ---------------------------------------------------------------------------------------------
alter table public.study_plans
  add constraint study_plans_week_start_monday check (extract(isodow from week_start) = 1);

-- ---------------------------------------------------------------------------------------------
-- 2. study_activities
-- ---------------------------------------------------------------------------------------------
alter table public.study_activities
  add column description text,
  add column position integer not null default 0;

alter table public.study_activities
  add constraint study_activities_description_len check (description is null or char_length(description) <= 2000),
  add constraint study_activities_position_nonneg check (position >= 0),
  add constraint study_activities_title_len check (char_length(btrim(title)) between 1 and 120),
  add constraint study_activities_planned_minutes_range check (planned_minutes between 1 and 240);

-- Categorias: MVP da ET-002 + 'writing' mantido por compatibilidade com a ET-001 (decisão aprovada).
alter table public.study_activities drop constraint study_activities_skill_check;
alter table public.study_activities
  add constraint study_activities_skill_check
  check (skill in ('grammar','vocabulary','listening','speaking','writing','review','other'));

create index study_activities_plan_day_idx on public.study_activities (plan_id, study_day, position);

-- Guarda de INSERT/UPDATE: imutabilidade de dono/plano, dia dentro da semana, limite de 30/dia,
-- posição automática no fim do dia (criação ou mudança de dia). Trava o plano para serializar.
create or replace function public.study_activities_guard()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  v_week date;
  v_count integer;
  v_day_changed boolean := tg_op = 'INSERT' or new.study_day is distinct from old.study_day;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'study_activities.user_id is immutable' using errcode = '42501';
    end if;
    if new.plan_id is distinct from old.plan_id then
      raise exception 'an activity cannot be moved to another plan or week' using errcode = '23514';
    end if;
  end if;

  -- Só o plano do MESMO dono é considerado. Se não existir (ou for de outro usuário),
  -- deixa a FK composta rejeitar a linha com erro de integridade.
  select p.week_start into v_week
    from public.study_plans p
   where p.id = new.plan_id and p.user_id = new.user_id
   for update;
  if not found then
    return new;
  end if;

  if new.study_day < v_week or new.study_day > v_week + 6 then
    raise exception 'study_day must be within the plan week (% to %)', v_week, v_week + 6
      using errcode = '23514';
  end if;

  if v_day_changed then
    select count(*) into v_count
      from public.study_activities a
     where a.plan_id = new.plan_id and a.study_day = new.study_day and a.id <> new.id;
    if v_count >= 30 then
      raise exception 'a day cannot have more than 30 activities' using errcode = '23514';
    end if;

    if (tg_op = 'INSERT' and new.position = 0)
       or (tg_op = 'UPDATE' and new.position = old.position) then
      select coalesce(max(a.position), 0) + 1 into new.position
        from public.study_activities a
       where a.plan_id = new.plan_id and a.study_day = new.study_day and a.id <> new.id;
    end if;
  end if;

  new.title := btrim(new.title);
  return new;
end;
$$;

create trigger study_activities_guard
  before insert or update on public.study_activities
  for each row execute function public.study_activities_guard();

-- Bloqueio de exclusão de atividade com execução registrada (concluída ou reaberta).
-- Vale para DELETE direto e para exclusões em cascata (ex.: excluir o plano). Sem exceções.
create or replace function public.study_activities_block_delete_with_history()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if exists (select 1 from public.study_sessions s where s.activity_id = old.id) then
    raise exception 'activity % has execution history and cannot be deleted', old.id
      using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger study_activities_block_delete_with_history
  before delete on public.study_activities
  for each row execute function public.study_activities_block_delete_with_history();

-- ---------------------------------------------------------------------------------------------
-- 3. study_sessions
-- ---------------------------------------------------------------------------------------------
-- Linhas existentes (se houver) representavam execuções concluídas: default true.
alter table public.study_sessions
  add column is_completed boolean not null default true,
  add column reopened_at timestamptz;

alter table public.study_sessions
  add constraint study_sessions_actual_minutes_range check (actual_minutes between 0 and 480),
  add constraint study_sessions_reopened_consistency check (is_completed or reopened_at is not null);

create unique index study_sessions_one_per_activity
  on public.study_sessions (activity_id)
  where activity_id is not null;

-- A execução não troca de dono nem de atividade (histórico auditável).
create or replace function public.study_sessions_guard()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'study_sessions.user_id is immutable' using errcode = '42501';
  end if;
  if new.activity_id is not null and new.activity_id is distinct from old.activity_id then
    raise exception 'study_sessions.activity_id is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger study_sessions_guard
  before update on public.study_sessions
  for each row execute function public.study_sessions_guard();

-- ---------------------------------------------------------------------------------------------
-- 4. Funções de negócio (SECURITY INVOKER; RLS e FKs continuam valendo)
-- ---------------------------------------------------------------------------------------------

-- Cria o plano inicial da semana ATUAL (America/Cuiaba) com as 5 atividades de segunda-feira.
-- Idempotente e segura sob concorrência: se o plano da semana já existir, é devolvido sem alteração.
create or replace function public.create_initial_plan()
returns public.study_plans
language plpgsql security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_week date;
  v_plan public.study_plans;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_week := date_trunc('week', now() at time zone 'America/Cuiaba')::date;

  insert into public.study_plans (user_id, week_start, title)
  values (uid, v_week, 'Semana de ' || to_char(v_week, 'DD/MM/YYYY'))
  on conflict (user_id, week_start) do nothing
  returning * into v_plan;

  if v_plan.id is null then
    select * into v_plan from public.study_plans where user_id = uid and week_start = v_week;
    return v_plan;
  end if;

  insert into public.study_activities (user_id, plan_id, study_day, position, skill, title, description, planned_minutes)
  values
    (uid, v_plan.id, v_week, 1, 'grammar',    'Apresentando-se — Gramática',   'I am / You are / He is / She is; contrações I''m, you''re, he''s.', 15),
    (uid, v_plan.id, v_week, 2, 'vocabulary', 'Apresentando-se — Vocabulário', 'name, age, city, country, job, student, happy, tired.', 10),
    (uid, v_plan.id, v_week, 3, 'listening',  'Apresentando-se — Listening',   'Ouça um diálogo de apresentação A1 do British Council.', 15),
    (uid, v_plan.id, v_week, 4, 'speaking',   'Apresentando-se — Speaking',    'Escreva 8 frases sobre você e leia cada uma em voz alta.', 10),
    (uid, v_plan.id, v_week, 5, 'review',     'Apresentando-se — Revisão',     'Revise o conteúdo, escreva 3 frases novas e confira os erros.', 10);

  return v_plan;
end;
$$;

-- Conclui uma atividade do próprio usuário: cria ou atualiza A ÚNICA execução (idempotente).
create or replace function public.complete_activity(p_activity_id uuid, p_actual_minutes integer)
returns public.study_sessions
language plpgsql security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_session public.study_sessions;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_actual_minutes is null or p_actual_minutes < 0 or p_actual_minutes > 480 then
    raise exception 'actual minutes must be an integer between 0 and 480' using errcode = '22023';
  end if;

  perform 1 from public.study_activities a
   where a.id = p_activity_id and a.user_id = uid
   for update;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;

  insert into public.study_sessions (user_id, activity_id, completed_at, actual_minutes, is_completed)
  values (uid, p_activity_id, now(), p_actual_minutes, true)
  on conflict (activity_id) where activity_id is not null
  do update set completed_at   = excluded.completed_at,
                actual_minutes = excluded.actual_minutes,
                is_completed   = true
  returning * into v_session;

  return v_session;
end;
$$;

-- Reabre: deixa de contar como concluída, preserva minutos, completed_at e a sessão. Idempotente.
create or replace function public.reopen_activity(p_activity_id uuid)
returns public.study_sessions
language plpgsql security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_session public.study_sessions;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.study_sessions s
     set is_completed = false,
         reopened_at  = now()
   where s.activity_id = p_activity_id and s.user_id = uid and s.is_completed
  returning * into v_session;

  if v_session.id is null then
    select * into v_session from public.study_sessions s
     where s.activity_id = p_activity_id and s.user_id = uid;
    if v_session.id is null then
      raise exception 'no execution to reopen' using errcode = 'P0002';
    end if;
  end if;

  return v_session;
end;
$$;

-- Define a ordem de um dia: p_ids deve conter exatamente as atividades daquele dia do plano.
create or replace function public.reorder_day_activities(p_plan_id uuid, p_study_day date, p_ids uuid[])
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_n integer := coalesce(array_length(p_ids, 1), 0);
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  perform 1 from public.study_plans p where p.id = p_plan_id and p.user_id = uid for update;
  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;

  if v_n = 0
     or (select count(distinct x) from unnest(p_ids) x) <> v_n
     or (select count(*) from public.study_activities a
          where a.plan_id = p_plan_id and a.study_day = p_study_day and a.user_id = uid) <> v_n
     or exists (select 1 from unnest(p_ids) x
                 where not exists (select 1 from public.study_activities a
                                    where a.id = x and a.plan_id = p_plan_id
                                      and a.study_day = p_study_day and a.user_id = uid)) then
    raise exception 'ids must match exactly the activities of that day' using errcode = '22023';
  end if;

  update public.study_activities a
     set position = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
   where a.id = o.id and a.user_id = uid;
end;
$$;

-- Resumo de uma semana planejada (regra única para /schedule e /dashboard).
-- Conta somente execuções concluídas (is_completed); agrega pela semana do PLANO.
create or replace function public.get_week_summary(p_week_start date)
returns table (
  has_plan boolean,
  planned_count integer,
  planned_minutes integer,
  completed_count integer,
  completed_minutes integer
)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return query
  select
    exists (select 1 from public.study_plans p where p.user_id = uid and p.week_start = p_week_start),
    count(a.id)::integer,
    coalesce(sum(a.planned_minutes), 0)::integer,
    (count(s.id) filter (where s.is_completed))::integer,
    coalesce(sum(s.actual_minutes) filter (where s.is_completed), 0)::integer
  from public.study_plans p
  join public.study_activities a on a.plan_id = p.id and a.user_id = uid
  left join public.study_sessions s on s.activity_id = a.id and s.user_id = uid
  where p.user_id = uid and p.week_start = p_week_start;
end;
$$;

-- EXECUTE apenas para authenticated (Supabase concede a anon/public por default privileges).
revoke all on function public.create_initial_plan() from public, anon;
revoke all on function public.complete_activity(uuid, integer) from public, anon;
revoke all on function public.reopen_activity(uuid) from public, anon;
revoke all on function public.reorder_day_activities(uuid, date, uuid[]) from public, anon;
revoke all on function public.get_week_summary(date) from public, anon;
grant execute on function public.create_initial_plan() to authenticated;
grant execute on function public.complete_activity(uuid, integer) to authenticated;
grant execute on function public.reopen_activity(uuid) to authenticated;
grant execute on function public.reorder_day_activities(uuid, date, uuid[]) to authenticated;
grant execute on function public.get_week_summary(date) to authenticated;

-- Funções de trigger não são chamáveis pelo cliente.
revoke all on function public.study_activities_guard() from public, anon, authenticated;
revoke all on function public.study_activities_block_delete_with_history() from public, anon, authenticated;
revoke all on function public.study_sessions_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Grants das tabelas do cronograma (políticas RLS existentes preservadas)
-- ---------------------------------------------------------------------------------------------
-- anon não tem nenhum uso legítimo dessas tabelas.
revoke all on public.study_plans, public.study_activities, public.study_sessions from anon;
-- TRUNCATE ignora RLS; TRIGGER/REFERENCES não são usados pelo app.
revoke truncate, trigger, references on public.study_plans, public.study_activities, public.study_sessions from authenticated;
-- O app nunca apaga execuções: histórico preservado. (A policy study_sessions_delete_own
-- da ET-001 é mantida, mas fica inerte sem o privilégio DELETE.)
revoke delete on public.study_sessions from authenticated;
