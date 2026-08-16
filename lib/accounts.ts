import type { SupabaseClient } from "@supabase/supabase-js";

// Used everywhere a transaction gets created without the user having picked
// an account explicitly (Aslan's tools, the recurring-post cron) -- so it
// still counts toward that account's balance instead of silently landing in
// accountBalances' "unassigned" bucket. Returns null if the user hasn't set
// a primary account, which is a normal, expected case, not an error.
export async function getPrimaryAccountId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  return data?.id ?? null;
}
