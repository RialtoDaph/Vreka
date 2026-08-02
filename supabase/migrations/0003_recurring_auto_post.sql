-- Fase 1: opsi auto-post buat pos tetap, biar nggak harus dicentang manual
-- tiap bulan. day_of_month cuma dipakai kalau auto_post true.
alter table public.recurring_items
  add column auto_post boolean not null default false,
  add column day_of_month smallint check (day_of_month between 1 and 31);
