import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";
import { getNotificationPreferences } from "@/lib/notificationPreferences";

export type BudgetAlertLevel = "warn" | "over";

// >=100% is "over", >=90% is "warn" -- matches the threshold BudgetsTab.tsx
// and the daily-digest cron already use for surfacing budget alerts
// elsewhere in the app.
export function evaluateBudgetAlert(
  spent: number,
  monthlyLimit: number
): { pct: number; level: BudgetAlertLevel | null } {
  if (!monthlyLimit || monthlyLimit <= 0) return { pct: 0, level: null };
  const pct = Math.round((spent / monthlyLimit) * 100);
  if (pct >= 100) return { pct, level: "over" };
  if (pct >= 90) return { pct, level: "warn" };
  return { pct, level: null };
}

// Fires a push the moment a category crosses 90%/100% of its monthly
// budget, instead of waiting for next morning's digest. Sends at most once
// per (category, level, month) -- budget_alert_log's unique constraint is
// the actual guard (atomic insert-wins, same pattern as the cron jobs'
// dedupe), so a burst of transactions in the same category right after a
// threshold is crossed only pushes once. Silently no-ops if there's no
// budget set for the category, or the push infra isn't configured --
// callers fire this fire-and-forget after a transaction write and
// shouldn't have that write's success depend on it.
export async function checkBudgetAlertAndNotify(
  supabase: SupabaseClient,
  userId: string,
  category: string
): Promise<void> {
  const prefs = await getNotificationPreferences(supabase, userId);
  if (!prefs.pushBudgetAlerts) return;

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);

  const [{ data: budget }, { data: txRows }] = await Promise.all([
    supabase
      .from("budgets")
      .select("monthly_limit")
      .eq("user_id", userId)
      .eq("category", category)
      .maybeSingle(),
    supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("type", "expense")
      .eq("category", category)
      .gte("occurred_on", firstDayOfMonth),
  ]);
  if (!budget) return;

  const spent = (txRows ?? []).reduce((sum, t) => sum + Number(t.amount), 0);
  const { pct, level } = evaluateBudgetAlert(spent, Number(budget.monthly_limit));
  if (!level) return;

  const { error: claimError } = await supabase
    .from("budget_alert_log")
    .insert({ user_id: userId, category, month, level });
  // Unique-violation means this (category, level, month) already got a push
  // this month -- any other error is treated the same way (don't push) so a
  // transient DB hiccup can't spam a duplicate on retry either.
  if (claimError) return;

  await sendPushToUser(supabase, userId, {
    title: level === "over" ? "🚨 Anggaran kebobolan" : "⚠️ Anggaran hampir jebol",
    body: `${category} udah ${pct}% dari batas bulan ini.`,
    url: "/dashboard/keuangan",
  });
}
