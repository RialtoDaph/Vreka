-- Full-text search across the user's own data. Each searchable table gets a
-- generated tsvector column (stored, so it's indexed like any other column)
-- built from its user-facing text fields, plus a GIN index for fast lookups.
-- 'simple' config is used instead of 'english' because the app's content is
-- mostly Indonesian, which Postgres has no bundled stemmer for -- 'simple'
-- still gives real word-boundary tokenization (a big step up from ILIKE
-- substring scans), just without stemming.
alter table public.transactions
  add column search_vector tsvector
  generated always as (
    to_tsvector('simple', coalesce(category, '') || ' ' || coalesce(description, ''))
  ) stored;
create index transactions_search_vector_idx on public.transactions using gin (search_vector);

alter table public.tasks
  add column search_vector tsvector
  generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored;
create index tasks_search_vector_idx on public.tasks using gin (search_vector);

alter table public.study_notes
  add column search_vector tsvector
  generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored;
create index study_notes_search_vector_idx on public.study_notes using gin (search_vector);

alter table public.journal_entries
  add column search_vector tsvector
  generated always as (
    to_tsvector('simple', coalesce(content, ''))
  ) stored;
create index journal_entries_search_vector_idx on public.journal_entries using gin (search_vector);

alter table public.assistant_memories
  add column search_vector tsvector
  generated always as (
    to_tsvector('simple', coalesce(content, ''))
  ) stored;
create index assistant_memories_search_vector_idx on public.assistant_memories using gin (search_vector);
