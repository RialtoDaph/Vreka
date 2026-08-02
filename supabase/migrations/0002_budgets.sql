-- Fase 1: anggaran bulanan per kategori pengeluaran.
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  category text not null,
  monthly_limit numeric not null check (monthly_limit > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category)
);

create index idx_budgets_user on public.budgets using btree (user_id);

alter table public.budgets enable row level security;

create policy budgets_owner_select on public.budgets for select using (auth.uid() = user_id);
create policy budgets_owner_insert on public.budgets for insert with check (auth.uid() = user_id);
create policy budgets_owner_update on public.budgets for update using (auth.uid() = user_id);
create policy budgets_owner_delete on public.budgets for delete using (auth.uid() = user_id);
