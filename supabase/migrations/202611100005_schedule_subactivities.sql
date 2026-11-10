-- ET-007 (evolução do cronograma) — subatividades e geração automática
-- Migração INCREMENTAL e aditiva sobre 202611100001_schedule.sql (que não é alterada).
--
--  * study_subactivities: etapas de uma atividade (título, descrição, minutos, ordem, status).
--    FK composta (user_id, activity_id) → mesmo dono; RLS por dono; excluída junto com a atividade.
--  * study_activities.generator_key: identifica atividades criadas pelo gerador, única por usuário,
--    para que repetir a geração NUNCA duplique registros.
--  * Novas categorias: lesson (Aula ChatGPT), music (Estudo musical), reading — as atuais continuam.
--  * Fonte da verdade da execução continua sendo study_sessions (ET-002): a atividade principal só é
--    concluída com minutos reais confirmados. Etapas não somam tempo realizado.
--  * Funções SECURITY INVOKER (RLS se aplica), search_path vazio, EXECUTE só para authenticated.
--    Sem triggers novos e sem SECURITY DEFINER.

-- 0. Pré-checagem (não deve haver nada a corrigir; aborta sem apagar dados se houver) --------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'study_subactivities') then
    raise exception 'study_subactivities já existe; esta migração não deve ser reaplicada';
  end if;
end $$;

-- 1. study_activities: chave do gerador e novas categorias ---------------------------------------
alter table public.study_activities add column generator_key text;
alter table public.study_activities
  add constraint study_activities_generator_key_len check (generator_key is null or char_length(generator_key) between 1 and 120);
create unique index study_activities_generator_key_idx
  on public.study_activities (user_id, generator_key)
  where generator_key is not null;

-- Amplia (não restringe) as categorias aceitas: os dados existentes continuam válidos.
alter table public.study_activities drop constraint study_activities_skill_check;
alter table public.study_activities
  add constraint study_activities_skill_check
  check (skill in ('grammar', 'vocabulary', 'listening', 'speaking', 'writing', 'review', 'other', 'reading', 'lesson', 'music'));

-- 2. study_subactivities --------------------------------------------------------------------------
create table public.study_subactivities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  activity_id uuid not null,
  position integer not null check (position >= 1),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  planned_minutes integer not null check (planned_minutes between 1 and 240),
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint study_subactivities_completed_consistency check (is_completed = (completed_at is not null)),
  -- A etapa pertence a uma atividade do MESMO usuário; excluir a atividade exclui suas etapas.
  constraint study_subactivities_owner_activity_fk
    foreign key (user_id, activity_id) references public.study_activities (user_id, id) on delete cascade
);
create index study_subactivities_activity_idx on public.study_subactivities (activity_id, position, id);

alter table public.study_subactivities enable row level security;
create policy study_subactivities_select_own on public.study_subactivities
  for select to authenticated using (user_id = (select auth.uid()));
create policy study_subactivities_insert_own on public.study_subactivities
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy study_subactivities_update_own on public.study_subactivities
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy study_subactivities_delete_own on public.study_subactivities
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.study_subactivities from anon;
revoke truncate, trigger, references on public.study_subactivities from authenticated;

-- 3. Auxiliar: valida e grava as etapas de uma atividade (chamada só pelas funções abaixo) ----------
-- p_steps: [{ "id"?: uuid, "title": text, "description"?: text, "planned_minutes": int }, ...] na ordem.
-- Etapas com id existente são atualizadas (preservam o status); sem id são criadas; ausentes são removidas.
-- Retorna a soma dos minutos (0 se não houver etapas). Usa auth.uid() e confere o dono da atividade:
-- mesmo chamada diretamente, só altera etapas de atividades do próprio usuário (e o RLS também vale).
create function public.schedule_write_steps(p_activity_id uuid, p_steps jsonb)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  p_uid uuid := auth.uid();
  v_step jsonb;
  v_pos integer := 0;
  v_total integer := 0;
  v_keep uuid[] := '{}';
  v_id uuid;
  v_title text;
  v_minutes integer;
begin
  if p_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform 1 from public.study_activities a where a.id = p_activity_id and a.user_id = p_uid;
  if not found then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'steps must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_steps) > 20 then
    raise exception 'an activity can have at most 20 subactivities' using errcode = '22023';
  end if;

  for v_step in select value from jsonb_array_elements(p_steps) loop
    v_pos := v_pos + 1;
    v_title := btrim(coalesce(v_step ->> 'title', ''));
    v_minutes := (v_step ->> 'planned_minutes')::integer;
    if v_title = '' or v_minutes is null then
      raise exception 'each subactivity needs a title and planned minutes' using errcode = '22023';
    end if;
    v_total := v_total + v_minutes;
    v_id := nullif(v_step ->> 'id', '')::uuid;

    if v_id is not null then
      update public.study_subactivities s
         set position = v_pos,
             title = v_title,
             description = nullif(btrim(coalesce(v_step ->> 'description', '')), ''),
             planned_minutes = v_minutes
       where s.id = v_id and s.activity_id = p_activity_id and s.user_id = p_uid;
      if not found then
        raise exception 'subactivity % does not belong to this activity', v_id using errcode = '22023';
      end if;
    else
      insert into public.study_subactivities (user_id, activity_id, position, title, description, planned_minutes)
      values (p_uid, p_activity_id, v_pos, v_title, nullif(btrim(coalesce(v_step ->> 'description', '')), ''), v_minutes)
      returning id into v_id;
    end if;
    v_keep := v_keep || v_id;
  end loop;

  delete from public.study_subactivities s
   where s.activity_id = p_activity_id and s.user_id = p_uid and not (s.id = any (v_keep));

  return v_total;
end;
$$;

-- 4. Criar ou editar atividade + etapas em UMA transação ----------------------------------------
-- p_activity_id null = criar no plano p_plan_id; senão edita (o plano não muda: regra da ET-002).
-- Com etapas, planned_minutes = soma das etapas; sem etapas, usa p_planned_minutes (comportamento atual).
create function public.save_activity(
  p_activity_id uuid,
  p_plan_id uuid,
  p_study_day date,
  p_skill text,
  p_title text,
  p_description text,
  p_planned_minutes integer,
  p_steps jsonb default '[]'::jsonb
)
returns public.study_activities
language plpgsql security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_activity public.study_activities;
  v_total integer;
  v_has_steps boolean := coalesce(jsonb_array_length(p_steps), 0) > 0;
  v_done integer;
  v_count integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_activity_id is null then
    insert into public.study_activities (user_id, plan_id, study_day, skill, title, description, planned_minutes)
    values (uid, p_plan_id, p_study_day, p_skill, p_title, nullif(btrim(coalesce(p_description, '')), ''),
            case when v_has_steps then 1 else p_planned_minutes end)
    returning * into v_activity;
  else
    select * into v_activity from public.study_activities a
     where a.id = p_activity_id and a.user_id = uid
     for update;
    if not found then
      raise exception 'activity not found' using errcode = 'P0002';
    end if;
    update public.study_activities a
       set study_day = p_study_day,
           skill = p_skill,
           title = p_title,
           description = nullif(btrim(coalesce(p_description, '')), ''),
           planned_minutes = case when v_has_steps then a.planned_minutes else p_planned_minutes end
     where a.id = p_activity_id
    returning * into v_activity;
  end if;

  v_total := public.schedule_write_steps(v_activity.id, coalesce(p_steps, '[]'::jsonb));

  if v_has_steps then
    update public.study_activities a set planned_minutes = v_total where a.id = v_activity.id
    returning * into v_activity;

    -- Consistência: com etapa pendente, a atividade não pode estar concluída (minutos preservados).
    select count(*) filter (where s.is_completed), count(*) into v_done, v_count
      from public.study_subactivities s where s.activity_id = v_activity.id;
    if v_done < v_count then
      update public.study_sessions ss
         set is_completed = false, reopened_at = now()
       where ss.activity_id = v_activity.id and ss.user_id = uid and ss.is_completed;
    end if;
  end if;

  return v_activity;
end;
$$;

-- 5. Marcar/desmarcar uma etapa, mantendo a atividade principal consistente -----------------------
-- Ao concluir a ÚLTIMA etapa pendente, a principal é concluída com os minutos reais informados
-- (p_actual_minutes obrigatório nesse caso). Ao reabrir uma etapa, a principal volta a pendente.
create function public.set_subactivity_completed(p_subactivity_id uuid, p_completed boolean, p_actual_minutes integer default null)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_activity_id uuid;
  v_current boolean;
  v_done integer;
  v_count integer;
  v_parent_done boolean;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_completed is null then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  select s.activity_id into v_activity_id from public.study_subactivities s
   where s.id = p_subactivity_id and s.user_id = uid;
  if not found then
    raise exception 'subactivity not found' using errcode = 'P0002';
  end if;
  -- Serializa alterações concorrentes na mesma atividade.
  perform 1 from public.study_activities a where a.id = v_activity_id and a.user_id = uid for update;
  select s.is_completed into v_current from public.study_subactivities s where s.id = p_subactivity_id;

  if v_current is distinct from p_completed then

  select count(*) filter (where s.is_completed or s.id = p_subactivity_id), count(*) into v_done, v_count
    from public.study_subactivities s where s.activity_id = v_activity_id;

  if p_completed and v_done = v_count then
    -- Última etapa: a atividade principal será concluída; exige os minutos reais confirmados.
    if p_actual_minutes is null then
      raise exception 'actual minutes required to complete the last subactivity' using errcode = '22023';
    end if;
    perform public.complete_activity(v_activity_id, p_actual_minutes); -- também conclui todas as etapas
  else
    update public.study_subactivities s
       set is_completed = p_completed,
           completed_at = case when p_completed then coalesce(s.completed_at, now()) else null end
     where s.id = p_subactivity_id;
    if not p_completed then
      update public.study_sessions ss
         set is_completed = false, reopened_at = now()
       where ss.activity_id = v_activity_id and ss.user_id = uid and ss.is_completed;
    end if;
  end if;
  end if; -- estado já era o pedido: nada muda (idempotente)

  select coalesce(bool_or(ss.is_completed), false) into v_parent_done
    from public.study_sessions ss where ss.activity_id = v_activity_id;
  select count(*) filter (where s.is_completed), count(*) into v_done, v_count
    from public.study_subactivities s where s.activity_id = v_activity_id;
  return jsonb_build_object('activity_id', v_activity_id, 'done', v_done, 'total', v_count, 'activity_completed', v_parent_done);
end;
$$;

-- 6. Conclusão/reabertura manual da principal sincronizam as etapas -------------------------------
-- Mesmo contrato da ET-002 (assinatura, validações e retorno); acrescenta só a sincronização.
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

  -- ET-007: concluir a principal conclui todas as etapas pendentes.
  update public.study_subactivities s
     set is_completed = true, completed_at = coalesce(s.completed_at, now())
   where s.activity_id = p_activity_id and s.user_id = uid and not s.is_completed;

  return v_session;
end;
$$;

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

  -- ET-007: reabrir a principal manualmente volta todas as etapas a pendente.
  update public.study_subactivities s
     set is_completed = false, completed_at = null
   where s.activity_id = p_activity_id and s.user_id = uid and s.is_completed;

  return v_session;
end;
$$;

-- 7. Geração automática: tudo ou nada, idempotente ----------------------------------------------
-- p_items: [{ generator_key, study_day, skill, title, description?, planned_minutes, steps?: [...] }]
-- Cria os planos semanais que faltarem; itens cujo generator_key já existe são ignorados (não duplica,
-- não sobrescreve). Qualquer erro desfaz a geração inteira.
create function public.generate_schedule(p_items jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_item jsonb;
  v_day date;
  v_week date;
  v_plan_id uuid;
  v_activity_id uuid;
  v_total integer;
  v_created integer := 0;
  v_skipped integer := 0;
  v_steps integer := 0;
  v_key text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 120 then
    raise exception 'too many items in one generation' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_key := btrim(coalesce(v_item ->> 'generator_key', ''));
    if v_key = '' then
      raise exception 'generator_key is required' using errcode = '22023';
    end if;
    v_day := (v_item ->> 'study_day')::date;
    v_week := date_trunc('week', v_day)::date;

    insert into public.study_plans (user_id, week_start, title)
    values (uid, v_week, 'Semana de ' || to_char(v_week, 'DD/MM/YYYY'))
    on conflict (user_id, week_start) do nothing;
    select p.id into v_plan_id from public.study_plans p where p.user_id = uid and p.week_start = v_week;

    v_activity_id := null;
    insert into public.study_activities (user_id, plan_id, study_day, skill, title, description, planned_minutes, generator_key)
    values (uid, v_plan_id, v_day, v_item ->> 'skill', v_item ->> 'title',
            nullif(btrim(coalesce(v_item ->> 'description', '')), ''),
            (v_item ->> 'planned_minutes')::integer, v_key)
    on conflict (user_id, generator_key) where generator_key is not null do nothing
    returning id into v_activity_id;

    if v_activity_id is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_created := v_created + 1;

    if coalesce(jsonb_array_length(v_item -> 'steps'), 0) > 0 then
      v_total := public.schedule_write_steps(v_activity_id, v_item -> 'steps');
      v_steps := v_steps + jsonb_array_length(v_item -> 'steps');
      update public.study_activities a set planned_minutes = v_total where a.id = v_activity_id;
    end if;
  end loop;

  return jsonb_build_object('created', v_created, 'skipped', v_skipped, 'subactivities', v_steps);
end;
$$;

-- 8. EXECUTE apenas para authenticated -----------------------------------------------------------
revoke all on function public.schedule_write_steps(uuid, jsonb) from public, anon;
grant execute on function public.schedule_write_steps(uuid, jsonb) to authenticated; -- necessário: chamada por funções INVOKER
revoke all on function public.save_activity(uuid, uuid, date, text, text, text, integer, jsonb) from public, anon;
revoke all on function public.set_subactivity_completed(uuid, boolean, integer) from public, anon;
revoke all on function public.generate_schedule(jsonb) from public, anon;
revoke all on function public.complete_activity(uuid, integer) from public, anon;
revoke all on function public.reopen_activity(uuid) from public, anon;
grant execute on function public.save_activity(uuid, uuid, date, text, text, text, integer, jsonb) to authenticated;
grant execute on function public.set_subactivity_completed(uuid, boolean, integer) to authenticated;
grant execute on function public.generate_schedule(jsonb) to authenticated;
grant execute on function public.complete_activity(uuid, integer) to authenticated;
grant execute on function public.reopen_activity(uuid) to authenticated;
