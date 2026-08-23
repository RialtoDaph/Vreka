-- Lets a savings goal track physical gold (emas batangan) instead of just
-- cash. A "beli emas" purchase records the price paid (adds to
-- current_amount, same ledger-less accumulation "Tambah Dana" already does)
-- and the grams bought (adds to total_grams) -- current_amount / total_grams
-- then gives a running weighted-average cost per gram for free, with no
-- separate purchase-history table needed.
alter table public.savings_goals
  add column asset_type text not null default 'cash' check (asset_type in ('cash', 'gold')),
  add column total_grams numeric not null default 0 check (total_grams >= 0);
