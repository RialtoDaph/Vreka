-- Idempotency ledger for cron jobs (app/api/cron/*).
--
-- daily-digest had no guard at all against a retry or an overlapping
-- invocation re-running the same day's work -- a duplicate call would
-- re-send the Gmail digest, Telegram morning briefing, and push
-- notification to every user, and re-spend an Anthropic API call per user
-- doing it. Each send now first claims a `(job, dedupe_key)` row via
-- insert; the unique constraint means only the first caller for a given
-- key wins, the same atomic-claim pattern used for recurring-post's
-- period dedupe. No user-facing access is needed -- only the admin
-- (service-role) client in the cron routes ever touches this table, so RLS
-- is enabled with no policies (deny-all to anon/authenticated, service
-- role bypasses RLS regardless).
create table public.cron_dedupe (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (job, dedupe_key)
);

alter table public.cron_dedupe enable row level security;
