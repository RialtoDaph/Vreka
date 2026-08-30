-- Enables Supabase Realtime (postgres_changes) for the two tables the
-- client now subscribes to directly instead of polling:
--   - assistant_audit_log inserts -> AslanInbox's unread-activity toast
--     (was polling every 60s)
--   - telegram_links updates -> AI Core's "waiting for Telegram link
--     confirmation" check (was polling every 3s, up to 20 times)
-- RLS (already enabled on both tables) is respected by Realtime
-- automatically -- a client only receives change events for rows it could
-- also SELECT, same as any other query.
alter publication supabase_realtime add table public.assistant_audit_log;
alter publication supabase_realtime add table public.telegram_links;

-- UPDATE events need the full old+new row to be useful (Supabase's default
-- replica identity only guarantees the primary key columns on the old row);
-- telegram_links has no natural single-column PK payload consumers can
-- reason about, and this is the one of the two tables Vreka actually
-- listens for UPDATEs on (the audit log is insert-only).
alter table public.telegram_links replica identity full;
