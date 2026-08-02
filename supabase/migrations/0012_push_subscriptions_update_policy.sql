-- Add the missing UPDATE policy on push_subscriptions.
--
-- app/api/push/subscribe/route.ts upserts with `onConflict: "endpoint"`.
-- The table only had select/insert/delete policies (verified directly
-- against production via the Supabase RLS catalog -- unlike the
-- recurring_item_checks cascade in 0011, this one is a real, currently
-- active gap, not just a stale snapshot). Any conflict on `endpoint` --
-- including the ordinary case of the same browser/device re-subscribing
-- after a PWA reload -- hits the ON CONFLICT DO UPDATE path, which RLS
-- silently denies with no matching policy, so the upsert 500s and push
-- notifications quietly stop working for that subscription until the row
-- is deleted manually.

create policy push_subscriptions_owner_update on public.push_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
