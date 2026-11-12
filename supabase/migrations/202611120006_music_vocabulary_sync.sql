-- ET-008 — Sincronização automática Música → Vocabulário
-- Migração INCREMENTAL e aditiva (não altera migrações anteriores; nenhuma tabela nova; nenhum dado alterado).
--
--  * vocabulary.example_1 / example_2 passam a ser opcionais (as constraints de tamanho da ET-003 continuam:
--    NULL é aceito, texto vazio/só espaços não).
--  * Funções SECURITY INVOKER (RLS e grants do usuário continuam valendo), cada chamada é uma transação:
--      add_music_word     grava a palavra no estudo e sincroniza (tudo ou nada)
--      update_music_word  corrige significado/trecho; se ainda não vinculada, sincroniza
--      sync_music_words   sincroniza as palavras antigas não vinculadas (idempotente)
--      sync_music_word    regra única usada pelas três acima
--  * Regra de sincronização (por usuário, mesma normalização da unicidade da ET-003: lower(btrim(word))):
--      - palavra já existe no vocabulário → só vincula; nada é sobrescrito (no máximo preenche example_1 vazio
--        com o trecho); histórico e agendamento SRS intactos;
--      - não existe e há significado → cria (tradução = significado, exemplo 1 = trecho, origem = o estudo,
--        sem revisão = palavra nova) e vincula;
--      - não existe e não há significado → fica pendente (nada é inventado).
--  * Excluir a palavra do estudo continua apagando só a linha de music_words.

-- 1. Exemplos opcionais -------------------------------------------------------------------------------
alter table public.vocabulary
  alter column example_1 drop not null,
  alter column example_2 drop not null;

-- 2. Regra de sincronização de UMA palavra do estudo -----------------------------------------------------
-- Retorna 'created' | 'linked' | 'pending' | 'already'.
create function public.sync_music_word(p_word_id uuid)
returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_word public.music_words;
  v_vocab_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_word from public.music_words where id = p_word_id and user_id = v_uid for update;
  if not found then
    raise exception 'music word not found' using errcode = 'P0002';
  end if;
  if v_word.vocabulary_id is not null then
    return 'already';
  end if;

  select id into v_vocab_id
    from public.vocabulary
   where user_id = v_uid and lower(btrim(word)) = lower(btrim(v_word.term));

  if v_vocab_id is null then
    if v_word.meaning is null or btrim(v_word.meaning) = '' then
      return 'pending';
    end if;
    insert into public.vocabulary (user_id, word, translation, example_1, source_type, source_ref)
    values (v_uid, btrim(v_word.term), btrim(v_word.meaning), nullif(btrim(v_word.excerpt), ''), 'music', v_word.music_study_id)
    on conflict (user_id, (lower(btrim(word)))) do nothing
    returning id into v_vocab_id;

    if v_vocab_id is not null then
      update public.music_words set vocabulary_id = v_vocab_id where id = v_word.id;
      return 'created';
    end if;
    -- outra transação criou a mesma palavra ao mesmo tempo: reutiliza
    select id into v_vocab_id
      from public.vocabulary
     where user_id = v_uid and lower(btrim(word)) = lower(btrim(v_word.term));
  end if;

  update public.music_words set vocabulary_id = v_vocab_id where id = v_word.id;
  -- só completa um exemplo AUSENTE; tradução, exemplos existentes e SRS não são tocados
  if nullif(btrim(v_word.excerpt), '') is not null then
    update public.vocabulary set example_1 = btrim(v_word.excerpt)
     where id = v_vocab_id and user_id = v_uid and example_1 is null;
  end if;
  return 'linked';
end;
$$;

-- 3. Nova palavra no estudo (significado obrigatório) -------------------------------------------------
create function public.add_music_word(p_study_id uuid, p_term text, p_meaning text, p_excerpt text default null)
returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_meaning is null or btrim(p_meaning) = '' then
    raise exception 'meaning required' using errcode = '22023';
  end if;
  insert into public.music_words (user_id, music_study_id, term, meaning, excerpt)
  values (v_uid, p_study_id, btrim(p_term), btrim(p_meaning), nullif(btrim(p_excerpt), ''))
  returning id into v_id;
  return public.sync_music_word(v_id);
end;
$$;

-- 4. Edição (significado e trecho) ---------------------------------------------------------------------
-- Palavra já vinculada: só a palavra do estudo muda (o vocabulário é preservado).
create function public.update_music_word(p_word_id uuid, p_meaning text, p_excerpt text default null)
returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_meaning is null or btrim(p_meaning) = '' then
    raise exception 'meaning required' using errcode = '22023';
  end if;
  update public.music_words
     set meaning = btrim(p_meaning), excerpt = nullif(btrim(p_excerpt), '')
   where id = p_word_id and user_id = v_uid;
  if not found then
    raise exception 'music word not found' using errcode = 'P0002';
  end if;
  return public.sync_music_word(p_word_id);
end;
$$;

-- 5. Sincronização retroativa (idempotente) -----------------------------------------------------------
create function public.sync_music_words()
returns table (created integer, linked integer, pending integer)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_result text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  created := 0; linked := 0; pending := 0;
  for v_id in
    select id from public.music_words
     where user_id = v_uid and vocabulary_id is null
     order by created_at, id
  loop
    v_result := public.sync_music_word(v_id);
    if v_result = 'created' then created := created + 1;
    elsif v_result = 'linked' then linked := linked + 1;
    elsif v_result = 'pending' then pending := pending + 1;
    end if;
  end loop;
  return next;
end;
$$;

-- 6. Execução: só authenticated -----------------------------------------------------------------------
revoke all on function public.sync_music_word(uuid) from public, anon;
revoke all on function public.add_music_word(uuid, text, text, text) from public, anon;
revoke all on function public.update_music_word(uuid, text, text) from public, anon;
revoke all on function public.sync_music_words() from public, anon;
grant execute on function public.sync_music_word(uuid) to authenticated;
grant execute on function public.add_music_word(uuid, text, text, text) to authenticated;
grant execute on function public.update_music_word(uuid, text, text) to authenticated;
grant execute on function public.sync_music_words() to authenticated;
