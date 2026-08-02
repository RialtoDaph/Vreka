-- Fase 2 (lanjutan): tag project per to-do, dan habit tracker terpisah dari
-- Kerjaan (kebiasaan harian beda konsep dari to-do berdeadline).
alter table public.tasks add column project text;

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  title text not null,
  created_at timestamptz not null default now()
);

create index idx_habits_user on public.habits using btree (user_id);

alter table public.habits enable row level security;

create policy habits_owner_select on public.habits for select using (auth.uid() = user_id);
create policy habits_owner_insert on public.habits for insert with check (auth.uid() = user_id);
create policy habits_owner_update on public.habits for update using (auth.uid() = user_id);
create policy habits_owner_delete on public.habits for delete using (auth.uid() = user_id);

create table public.habit_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  habit_id uuid not null references public.habits (id) on delete cascade,
  period date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, period)
);

create index idx_habit_checks_habit on public.habit_checks using btree (habit_id);

alter table public.habit_checks enable row level security;

create policy habit_checks_owner_select on public.habit_checks for select using (auth.uid() = user_id);
create policy habit_checks_owner_insert on public.habit_checks for insert with check (auth.uid() = user_id);
create policy habit_checks_owner_delete on public.habit_checks for delete using (auth.uid() = user_id);
