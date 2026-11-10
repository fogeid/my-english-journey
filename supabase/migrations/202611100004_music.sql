-- ET-006 — Estudos musicais
-- Migração INCREMENTAL e aditiva (não altera migrações anteriores).
--
--  * Reutiliza public.music_studies: song, artist, studied_on (data), report (observações gerais),
--    initial_comprehension / final_comprehension (comentários das avaliações, texto).
--    Acrescenta: study_number, level, status, initial_score, final_score (0–10).
--    A coluna difficulties (text[]) da ET-001 é preservada; as dificuldades passam a ser por atividade.
--  * music_activities: as 5 atividades fixas de cada estudo (no máximo uma de cada).
--  * music_words: palavras/expressões do estudo; vocabulary_id liga, opcionalmente, ao banco de
--    vocabulário (sem duplicar: a unicidade da ET-003 continua valendo em vocabulary).
--  * Apenas texto digitado pelo usuário, com limites curtos para trechos (sem letras completas, sem áudio).
--  * Sem funções novas, sem SECURITY DEFINER, sem triggers.

-- 1. music_studies -------------------------------------------------------------------------------
alter table public.music_studies
  add column study_number integer,
  add column level text,
  add column status text not null default 'in_progress',
  add column initial_score numeric(3, 1),
  add column final_score numeric(3, 1);

alter table public.music_studies
  add constraint music_studies_number_positive check (study_number is null or study_number > 0),
  add constraint music_studies_level_check check (level is null or level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  add constraint music_studies_status_check check (status in ('in_progress', 'completed')),
  add constraint music_studies_initial_score_range check (initial_score is null or (initial_score >= 0 and initial_score <= 10)),
  add constraint music_studies_final_score_range check (final_score is null or (final_score >= 0 and final_score <= 10)),
  add constraint music_studies_song_len check (char_length(btrim(song)) between 1 and 200),
  add constraint music_studies_artist_len check (char_length(btrim(artist)) between 1 and 200),
  add constraint music_studies_report_len check (report is null or char_length(report) <= 5000),
  add constraint music_studies_comprehension_len check (
    (initial_comprehension is null or char_length(initial_comprehension) <= 2000)
    and (final_comprehension is null or char_length(final_comprehension) <= 2000)
  );

create unique index music_studies_user_number_key on public.music_studies (user_id, study_number);
create unique index music_studies_owner_id_idx on public.music_studies (user_id, id);
create index music_studies_status_idx on public.music_studies (user_id, status, study_number);

-- 2. music_activities ----------------------------------------------------------------------------
create table public.music_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  music_study_id uuid not null,
  activity_type text not null check (activity_type in ('first_listening', 'vocabulary', 'translation', 'pronunciation', 'final_listening')),
  my_answers text check (my_answers is null or char_length(my_answers) <= 2000),
  difficulties text check (difficulties is null or char_length(difficulties) <= 2000),
  corrections text check (corrections is null or char_length(corrections) <= 2000),
  explanations text check (explanations is null or char_length(explanations) <= 2000),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (music_study_id, activity_type),
  constraint music_activities_owner_study_fk
    foreign key (user_id, music_study_id) references public.music_studies (user_id, id) on delete cascade
);

-- 3. music_words ---------------------------------------------------------------------------------
create table public.music_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  music_study_id uuid not null,
  term text not null check (char_length(btrim(term)) between 1 and 120),
  meaning text check (meaning is null or char_length(meaning) <= 240),
  excerpt text check (excerpt is null or char_length(excerpt) <= 300), -- trecho CURTO digitado pelo usuário
  vocabulary_id uuid,
  created_at timestamptz not null default now(),
  constraint music_words_owner_study_fk
    foreign key (user_id, music_study_id) references public.music_studies (user_id, id) on delete cascade,
  -- vínculo opcional com uma palavra do MESMO usuário; se ela for excluída, só o vínculo é anulado.
  constraint music_words_owner_vocabulary_fk
    foreign key (user_id, vocabulary_id) references public.vocabulary (user_id, id) on delete set null (vocabulary_id)
);
create unique index music_words_study_term_key on public.music_words (music_study_id, lower(btrim(term)));
create index music_words_vocabulary_idx on public.music_words (vocabulary_id);

-- 4. RLS: somente o dono ------------------------------------------------------------------------
do $$
declare tbl text;
begin
  foreach tbl in array array['music_activities', 'music_words'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', tbl || '_select_own', tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', tbl || '_insert_own', tbl);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', tbl || '_update_own', tbl);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', tbl || '_delete_own', tbl);
  end loop;
end $$;

-- 5. Grants: anon sem acesso; TRUNCATE (ignora RLS) e afins revogados -----------------------------
revoke all on public.music_studies, public.music_activities, public.music_words from anon;
revoke truncate, trigger, references on public.music_studies, public.music_activities, public.music_words from authenticated;
