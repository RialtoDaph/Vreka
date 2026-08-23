-- Per-category on/off switches for Aslan's notification channels
-- (previously all-or-nothing: push notifications were either subscribed or
-- not, with no way to silence just the daily digest while keeping budget
-- alerts, or vice versa). One row per user; a missing row means "never
-- customized" and every category defaults to on, matching the app's
-- behavior before this table existed (lib/notificationPreferences.ts).
create table public.notification_preferences (
  user_id uuid primary key references auth.users (id),
  push_daily_digest boolean not null default true,
  push_budget_alerts boolean not null default true,
  telegram_daily_briefing boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy notification_preferences_owner_select on public.notification_preferences
  for select using (auth.uid() = user_id);
create policy notification_preferences_owner_insert on public.notification_preferences
  for insert with check (auth.uid() = user_id);
create policy notification_preferences_owner_update on public.notification_preferences
  for update using (auth.uid() = user_id);
