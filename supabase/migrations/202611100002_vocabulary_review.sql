-- ET-003 — Vocabulário, flashcards e repetição espaçada
-- Migração INCREMENTAL e aditiva (não altera 202611090001 nem 202611100001).
--
-- Desenho simplificado (app pessoal, um usuário):
--  * Reutiliza vocabulary (word, translation, example_1/2, part_of_speech, source_*, next_review_at)
--    e vocabulary_reviews (rating, reviewed_at). Acrescenta só o necessário.
--  * next_review_at NULL = palavra nova (nunca revisada). É a fonte única da fila.
--  * Revisão: RPC review_vocabulary (SECURITY INVOKER) — trava a palavra, é idempotente por
--    request_id e grava histórico + agendamento na mesma transação. RLS continua valendo.
--  * Exclusão de palavra com histórico: bloqueada pela FK (NO ACTION), sem trigger.
--    A exclusão da conta (cascade a partir de profiles) segue funcionando.

-- 0. Pré-checagens: abortam sem apagar nada ---------------------------------------------------------
do $$
begin
  if exists (select 1 from public.vocabulary group by user_id, lower(btrim(word)) having count(*) > 1) then
    raise exception 'ET-003: há palavras duplicadas por usuário (ignorando maiúsculas/espaços); corrija manualmente antes de migrar';
  end if;
  if exists (select 1 from public.vocabulary
              where char_length(btrim(word)) not between 1 and 120
                 or char_length(btrim(translation)) not between 1 and 240
                 or char_length(btrim(example_1)) not between 1 and 500
                 or char_length(btrim(example_2)) not between 1 and 500) then
    raise exception 'ET-003: há palavras com campos vazios ou acima dos limites';
  end if;
end $$;

-- 1. vocabulary --------------------------------------------------------------------------------------
alter table public.vocabulary
  add column notes text,
  add column review_streak integer not null default 0,
  add column review_count integer not null default 0;

-- Preserva dados: contagem de revisões já existentes (se houver).
update public.vocabulary v
   set review_count = c.n
  from (select vocabulary_id, count(*)::integer as n from public.vocabulary_reviews group by vocabulary_id) c
 where c.vocabulary_id = v.id;

alter table public.vocabulary
  add constraint vocabulary_word_len check (char_length(btrim(word)) between 1 and 120),
  add constraint vocabulary_translation_len check (char_length(btrim(translation)) between 1 and 240),
  add constraint vocabulary_example_1_len check (char_length(btrim(example_1)) between 1 and 500),
  add constraint vocabulary_example_2_len check (char_length(btrim(example_2)) between 1 and 500),
  add constraint vocabulary_part_of_speech_len check (part_of_speech is null or char_length(part_of_speech) <= 40),
  add constraint vocabulary_notes_len check (notes is null or char_length(notes) <= 1000),
  add constraint vocabulary_review_streak_range check (review_streak between 0 and 100),
  add constraint vocabulary_review_count_nonneg check (review_count >= 0);

-- Sem duplicatas por usuário, ignorando maiúsculas e espaços nas pontas.
create unique index vocabulary_user_word_normalized_key on public.vocabulary (user_id, lower(btrim(word)));

-- 2. vocabulary_reviews ------------------------------------------------------------------------------
alter table public.vocabulary_reviews
  add column request_id uuid,
  add column interval_minutes integer,
  add column streak_after integer,
  add column next_review_at timestamptz;

alter table public.vocabulary_reviews
  add constraint vocabulary_reviews_interval_positive check (interval_minutes is null or interval_minutes > 0),
  add constraint vocabulary_reviews_streak_range check (streak_after is null or streak_after between 0 and 100);

-- Idempotência: um request_id por usuário.
create unique index vocabulary_reviews_request_key on public.vocabulary_reviews (user_id, request_id);
create index vocabulary_reviews_word_idx on public.vocabulary_reviews (vocabulary_id, reviewed_at);

-- Histórico não é apagado junto com a palavra: troca ON DELETE CASCADE por NO ACTION.
-- (NO ACTION é verificado ao fim do comando, então excluir a CONTA continua funcionando:
--  profiles apaga vocabulary e vocabulary_reviews na mesma cascata.)
alter table public.vocabulary_reviews
  drop constraint reviews_owner_word_fk,
  drop constraint vocabulary_reviews_vocabulary_id_fkey;
alter table public.vocabulary_reviews
  add constraint reviews_owner_word_fk
    foreign key (user_id, vocabulary_id) references public.vocabulary (user_id, id),
  add constraint vocabulary_reviews_vocabulary_id_fkey
    foreign key (vocabulary_id) references public.vocabulary (id);

-- 3. Funções (SECURITY INVOKER: RLS e grants do usuário se aplicam) --------------------------------

-- Registra uma revisão: trava a palavra, idempotente por request_id, histórico + agendamento atômicos.
-- Regra MVP (não é afirmação de eficácia pedagógica; pode ser substituída no futuro):
--   again 10 min, sequência = 0 | hard 1 dia, sequência mantida
--   good  sequência 0→1d, 1→3d, 2→7d, 3→14d, 4+→30d, +1
--   easy  sequência 0→3d, 1→7d, 2→14d, 3+→30d, +1      (sequência limitada a 100; 1 dia = 24 h)
create function public.review_vocabulary(p_vocabulary_id uuid, p_rating text, p_request_id uuid)
returns public.vocabulary_reviews
language plpgsql security invoker set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_word public.vocabulary;
  v_review public.vocabulary_reviews;
  v_minutes integer;
  v_streak integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_request_id is null or p_rating is null or p_rating not in ('again', 'hard', 'good', 'easy') then
    raise exception 'invalid review' using errcode = '22023';
  end if;

  select * into v_word
    from public.vocabulary
   where id = p_vocabulary_id and user_id = v_uid
     for update;
  if not found then
    raise exception 'vocabulary not found' using errcode = 'P0002';
  end if;

  -- Retry da mesma submissão: devolve o registro já gravado, sem duplicar.
  select * into v_review
    from public.vocabulary_reviews
   where user_id = v_uid and request_id = p_request_id;
  if found then
    if v_review.vocabulary_id <> p_vocabulary_id or v_review.rating <> p_rating then
      raise exception 'request_id already used for a different review' using errcode = '22023';
    end if;
    return v_review;
  end if;

  v_streak := case p_rating
                when 'again' then 0
                when 'hard' then v_word.review_streak
                else least(v_word.review_streak + 1, 100)
              end;
  v_minutes := case p_rating
                 when 'again' then 10
                 when 'hard' then 1440
                 when 'good' then 1440 * (case least(v_word.review_streak, 4)
                                            when 0 then 1 when 1 then 3 when 2 then 7 when 3 then 14 else 30 end)
                 else 1440 * (case least(v_word.review_streak, 3)
                                when 0 then 3 when 1 then 7 when 2 then 14 else 30 end)
               end;

  insert into public.vocabulary_reviews
    (user_id, vocabulary_id, rating, reviewed_at, request_id, interval_minutes, streak_after, next_review_at)
  values
    (v_uid, p_vocabulary_id, p_rating, now(), p_request_id, v_minutes, v_streak,
     now() + make_interval(mins => v_minutes))
  returning * into v_review;

  update public.vocabulary
     set next_review_at = v_review.next_review_at,
         review_streak = v_streak,
         review_count = v_word.review_count + 1,
         review_interval_days = v_minutes / 1440
   where id = p_vocabulary_id and user_id = v_uid;

  return v_review;
end;
$$;

-- Contagens com a hora do servidor (dashboard e /reviews).
create function public.get_vocabulary_summary()
returns table (total integer, due integer, new_words integer, server_now timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select count(*)::integer,
         (count(*) filter (where v.next_review_at <= now()))::integer,
         (count(*) filter (where v.next_review_at is null))::integer,
         now()
    from public.vocabulary v
   where v.user_id = auth.uid()
$$;

-- Fila: vencidas mais antigas primeiro; depois novas por data de criação e id.
create function public.get_review_queue(p_limit integer default 20)
returns setof public.vocabulary
language sql stable security invoker set search_path = ''
as $$
  select v.*
    from public.vocabulary v
   where v.user_id = auth.uid()
     and (v.next_review_at is null or v.next_review_at <= now())
   order by (v.next_review_at is null), v.next_review_at, v.created_at, v.id
   limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

-- Lista com busca (termo ou tradução), filtro e paginação. Parâmetros, não SQL dinâmico.
-- p_filter: 'all' | 'due' (revisão vencida) | 'new' (sem revisão)
create function public.list_vocabulary(
  p_search text default null,
  p_filter text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, word text, translation text, part_of_speech text, example_1 text, example_2 text,
  notes text, source_type text, source_ref uuid, next_review_at timestamptz,
  review_count integer, created_at timestamptz, total_count bigint
)
language sql stable security invoker set search_path = ''
as $$
  with q as (
    select '%' || replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern,
           btrim(coalesce(p_search, '')) = '' as no_search
  )
  select v.id, v.word, v.translation, v.part_of_speech, v.example_1, v.example_2,
         v.notes, v.source_type, v.source_ref, v.next_review_at,
         v.review_count, v.created_at, count(*) over ()
    from public.vocabulary v, q
   where v.user_id = auth.uid()
     and (q.no_search or v.word ilike q.pattern or v.translation ilike q.pattern)
     and (coalesce(p_filter, 'all') = 'all'
          or (p_filter = 'due' and v.next_review_at <= now())
          or (p_filter = 'new' and v.next_review_at is null))
   order by lower(v.word), v.id
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.review_vocabulary(uuid, text, uuid) from public, anon;
revoke all on function public.get_vocabulary_summary() from public, anon;
revoke all on function public.get_review_queue(integer) from public, anon;
revoke all on function public.list_vocabulary(text, text, integer, integer) from public, anon;
grant execute on function public.review_vocabulary(uuid, text, uuid) to authenticated;
grant execute on function public.get_vocabulary_summary() to authenticated;
grant execute on function public.get_review_queue(integer) to authenticated;
grant execute on function public.list_vocabulary(text, text, integer, integer) to authenticated;

-- 4. Grants: anon sem acesso; TRUNCATE (ignora RLS) e afins revogados. Policies RLS preservadas.
revoke all on public.vocabulary, public.vocabulary_reviews from anon;
revoke truncate, trigger, references on public.vocabulary, public.vocabulary_reviews from authenticated;
