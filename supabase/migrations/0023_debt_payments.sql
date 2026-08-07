-- debt_payment_checks (0018) only ever recorded "did I check this cycle" --
-- no amount, no linked transaction, no effect on the debt's balance. In
-- practice every debt on this account is a one-off loan paid down in
-- installments (e.g. a ~4400 bank transfer debt), not a recurring bill, so
-- there was never any way to record a partial payment, see the remaining
-- balance shrink, or have a payment show up in the rest of the app's cash
-- flow (budgets, analytics, exports). This replaces it with a proper
-- payment ledger, usable for both recurring and one-off debts, mirroring
-- how recurring_item_checks links a check to the transaction it created.
--
-- Table had zero rows in production, so a drop-and-recreate is safe -- no
-- backfill needed.
drop table public.debt_payment_checks;

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  debt_id uuid not null references public.debts (id) on delete cascade,
  amount numeric not null check (amount > 0),
  transaction_id uuid references public.transactions (id) on delete cascade,
  -- Only set for a recurring debt's cycle payment, so at most one payment
  -- claims a given month; a one-off debt's installments always have a null
  -- period and can be recorded as often as needed.
  period text,
  paid_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (debt_id, period)
);

create index idx_debt_payments_debt on public.debt_payments using btree (debt_id);

alter table public.debt_payments enable row level security;

-- No update policy on purpose -- same as its predecessor, a payment is
-- either recorded or undone (deleted), never edited in place.
create policy debt_payments_owner_select on public.debt_payments for select using (auth.uid() = user_id);
create policy debt_payments_owner_insert on public.debt_payments for insert with check (auth.uid() = user_id);
create policy debt_payments_owner_delete on public.debt_payments for delete using (auth.uid() = user_id);
