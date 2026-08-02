-- Fase 5: Web Push — simpen push subscription browser per user (bisa lebih
-- dari satu kalau install PWA-nya di beberapa device).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index idx_push_subscriptions_user on public.push_subscriptions using btree (user_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_owner_select on public.push_subscriptions for select using (auth.uid() = user_id);
create policy push_subscriptions_owner_insert on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy push_subscriptions_owner_delete on public.push_subscriptions for delete using (auth.uid() = user_id);
