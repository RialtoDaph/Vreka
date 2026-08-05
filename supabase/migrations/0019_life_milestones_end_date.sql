-- Optional end date for milestones that span a range (e.g. "kuliah di ITB",
-- 2018-2022) instead of a single point in time. Null keeps the old
-- behaviour of a one-day event.
alter table public.life_milestones
  add column ended_on date;

alter table public.life_milestones
  add constraint life_milestones_ended_on_after_start
  check (ended_on is null or ended_on >= occurred_on);
