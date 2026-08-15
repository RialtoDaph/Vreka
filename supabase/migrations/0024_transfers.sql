-- Transfers between the user's own accounts (rekening). Previously the
-- only way to move money between two accounts was two manual transactions
-- (an expense on one, an income on the other) -- which double-counted as
-- real income/expense in Analitik, Anggaran, and Saldo Bulan Ini even
-- though no actual income or spending happened. A dedicated 'transfer'
-- type is one atomic row instead of two, and since every income/expense
-- aggregate already filters on an exact type match, a 'transfer' row is
-- automatically excluded from all of them with no changes needed there.
--
-- Drops the existing type-column check constraint by looking it up rather
-- than hardcoding its (auto-generated, unverified-here) name, so this
-- doesn't depend on knowing exactly what Postgres named it.
do $$
declare
  existing_constraint text;
begin
  select con.conname into existing_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'transactions'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%type%income%expense%';

  if existing_constraint is not null then
    execute format('alter table public.transactions drop constraint %I', existing_constraint);
  end if;
end $$;

alter table public.transactions
  add constraint transactions_type_check check (type = any (array['income', 'expense', 'transfer']));

alter table public.transactions add column to_account_id uuid references public.accounts (id) on delete set null;

-- A transfer only makes sense between two distinct, known accounts --
-- account_id is the source, to_account_id the destination. Doesn't
-- constrain income/expense rows at all (to_account_id stays null there).
alter table public.transactions add constraint transactions_transfer_accounts_check check (
  type <> 'transfer' or (account_id is not null and to_account_id is not null and account_id <> to_account_id)
);
