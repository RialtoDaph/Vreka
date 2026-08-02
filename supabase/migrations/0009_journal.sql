-- Fase 4: journal harian — freeform, terpisah dari Pelajaran. Satu entry per
-- hari per user (unique constraint), biar UI-nya bisa langsung upsert
-- "catatan hari ini" tanpa perlu nyari dulu.
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  entry_date date not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create index idx_journal_entries_user_date on public.journal_entries using btree (user_id, entry_date desc);

alter table public.journal_entries enable row level security;

create policy journal_entries_owner_select on public.journal_entries for select using (auth.uid() = user_id);
create policy journal_entries_owner_insert on public.journal_entries for insert with check (auth.uid() = user_id);
create policy journal_entries_owner_update on public.journal_entries for update using (auth.uid() = user_id);
create policy journal_entries_owner_delete on public.journal_entries for delete using (auth.uid() = user_id);
