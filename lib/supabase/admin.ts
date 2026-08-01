import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely. Server-only, and only for the
// cron route, which has no logged-in user session to scope queries with.
// Every query here MUST manually scope to the right user_id.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
