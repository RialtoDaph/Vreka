-- Fase 2 (lanjutan): timer sesi belajar + lampiran resource (link) per catatan.
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  note_id uuid not null references public.study_notes (id) on delete cascade,
  minutes integer not null check (minutes > 0),
  created_at timestamptz not null default now()
);

create index idx_study_sessions_note on public.study_sessions using btree (note_id);

alter table public.study_sessions enable row level security;

create policy study_sessions_owner_select on public.study_sessions for select using (auth.uid() = user_id);
create policy study_sessions_owner_insert on public.study_sessions for insert with check (auth.uid() = user_id);
create policy study_sessions_owner_delete on public.study_sessions for delete using (auth.uid() = user_id);

create table public.study_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  note_id uuid not null references public.study_notes (id) on delete cascade,
  label text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index idx_study_resources_note on public.study_resources using btree (note_id);

alter table public.study_resources enable row level security;

create policy study_resources_owner_select on public.study_resources for select using (auth.uid() = user_id);
create policy study_resources_owner_insert on public.study_resources for insert with check (auth.uid() = user_id);
create policy study_resources_owner_delete on public.study_resources for delete using (auth.uid() = user_id);
