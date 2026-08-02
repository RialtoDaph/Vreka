-- Bring the recurring_item_checks foreign keys in this snapshot in line
-- with what's actually live in production.
--
-- 0001_baseline_schema.sql declares both FKs with no ON DELETE behavior
-- (the implicit default, NO ACTION). That was already stale when it was
-- written: querying the live project's pg_constraint shows both
-- `recurring_item_checks_recurring_item_id_fkey` and
-- `recurring_item_checks_transaction_id_fkey` have had ON DELETE CASCADE
-- all along (as does `..._user_id_fkey`). So RecurringTab.tsx's "undo
-- check" comment ("check-nya ikut kehapus lewat cascade") is correct
-- about production's actual behavior -- the snapshot file just didn't
-- match it. This migration is a documentation/reproducibility fix so a
-- fresh project built from these snapshots (local dev, disaster
-- recovery -- see README) ends up with the same cascade behavior
-- production already has. It is a no-op against the existing production
-- database.

alter table public.recurring_item_checks
  drop constraint recurring_item_checks_recurring_item_id_fkey,
  add constraint recurring_item_checks_recurring_item_id_fkey
    foreign key (recurring_item_id) references public.recurring_items (id) on delete cascade;

alter table public.recurring_item_checks
  drop constraint recurring_item_checks_transaction_id_fkey,
  add constraint recurring_item_checks_transaction_id_fkey
    foreign key (transaction_id) references public.transactions (id) on delete cascade;
