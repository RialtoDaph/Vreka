-- Timeline Kehidupan: user-entered life milestones (pre-Vreka biography plus
-- ongoing life events), rendered alongside auto-derived "otomatis" entries
-- computed live from study_notes/habit_checks (not stored -- there's nothing
-- to migrate for those, they're recomputed on every page load).
create table public.life_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  title text not null,
  occurred_on date not null,
  category text not null check (category in ('pendidikan', 'karier', 'keluarga', 'lainnya')),
  description text,
  created_at timestamptz not null default now()
);

create index idx_life_milestones_user on public.life_milestones using btree (user_id);

alter table public.life_milestones enable row level security;

create policy life_milestones_owner_select on public.life_milestones for select using (auth.uid() = user_id);
create policy life_milestones_owner_insert on public.life_milestones for insert with check (auth.uid() = user_id);
create policy life_milestones_owner_update on public.life_milestones for update using (auth.uid() = user_id);
create policy life_milestones_owner_delete on public.life_milestones for delete using (auth.uid() = user_id);
