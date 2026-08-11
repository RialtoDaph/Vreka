-- Rekening (accounts) -- lets a user tag each transaction with where the
-- money actually sits, so "kekayaan total" can be computed from real
-- starting_balance + transaction history per account instead of guessing.
-- Deliberately separate from savings_goals, which stays a manual/aspirational
-- progress tracker and is never summed into account balances.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  name text not null,
  starting_balance numeric not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

-- At most one primary account per user -- Aslan's add_transaction tool
-- defaults new transactions to whichever account this points at.
create unique index accounts_one_primary_per_user on public.accounts (user_id) where is_primary;

alter table public.accounts enable row level security;

create policy accounts_owner_select on public.accounts for select using (auth.uid() = user_id);
create policy accounts_owner_insert on public.accounts for insert with check (auth.uid() = user_id);
create policy accounts_owner_update on public.accounts for update using (auth.uid() = user_id);
create policy accounts_owner_delete on public.accounts for delete using (auth.uid() = user_id);

-- Nullable and ON DELETE SET NULL on purpose: every transaction recorded
-- before this migration (and any the user chooses not to tag) has no
-- account, and deleting an account should unlink its transactions rather
-- than destroy transaction history.
alter table public.transactions add column account_id uuid references public.accounts (id) on delete set null;
