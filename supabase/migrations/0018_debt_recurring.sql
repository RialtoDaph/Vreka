-- Debts were a flat single due_date/status record -- no way to model a
-- recurring obligation (e.g. a bank transfer due the 20th of every month)
-- where each cycle needs its own "paid" mark without losing the underlying
-- debt. Mirrors the recurring_items/recurring_item_checks split: the debt
-- row itself just gains a recurrence flag + day-of-month, and a new
-- per-period check table tracks which cycles have been paid.

alter table public.debts
  add column is_recurring boolean not null default false,
  add column recurrence_day smallint check (recurrence_day between 1 and 31);

create table public.debt_payment_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  debt_id uuid not null references public.debts (id) on delete cascade,
  period text not null,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (debt_id, period)
);

create index idx_debt_payment_checks_debt on public.debt_payment_checks using btree (debt_id);

alter table public.debt_payment_checks enable row level security;

-- No update policy on purpose -- same as recurring_item_checks, a period is
-- either checked off or deleted (unchecked), never edited in place.
create policy debt_payment_checks_owner_select on public.debt_payment_checks for select using (auth.uid() = user_id);
create policy debt_payment_checks_owner_insert on public.debt_payment_checks for insert with check (auth.uid() = user_id);
create policy debt_payment_checks_owner_delete on public.debt_payment_checks for delete using (auth.uid() = user_id);
