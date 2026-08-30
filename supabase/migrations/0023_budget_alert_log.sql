-- Dedupe ledger for real-time budget-threshold push notifications
-- (lib/budgetAlerts.ts). Previously the only budget signal was the once-a-
-- day morning digest push (app/api/cron/daily-digest) -- a category
-- crossing 90%/100% right after breakfast wouldn't surface until the next
-- morning. Every transaction add now checks its category's spend and fires
-- an immediate push the moment a threshold is crossed, via
-- budget_alert_log's unique constraint claiming a (category, level, month)
-- slot so a burst of transactions in the same category only pushes once,
-- not once per transaction.
--
-- Owner-scoped RLS (not the deny-all admin-only `cron_dedupe` table) since
-- this needs to be writable from the user's own session -- both the
-- transaction-add API route and Aslan's add_transaction tool run with the
-- caller's session client, not the service role.
create table public.budget_alert_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  category text not null,
  month text not null,
  level text not null check (level in ('warn', 'over')),
  created_at timestamptz not null default now(),
  unique (user_id, category, month, level)
);

alter table public.budget_alert_log enable row level security;

create policy budget_alert_log_owner_select on public.budget_alert_log for select using (auth.uid() = user_id);
create policy budget_alert_log_owner_insert on public.budget_alert_log for insert with check (auth.uid() = user_id);
