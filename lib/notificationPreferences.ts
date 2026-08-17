import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationPreferences = {
  pushDailyDigest: boolean;
  pushBudgetAlerts: boolean;
  telegramDailyBriefing: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  pushDailyDigest: true,
  pushBudgetAlerts: true,
  telegramDailyBriefing: true,
};

// No row yet means the user never touched their preferences -- every
// category defaults to on, same as the app's behavior before this
// preference center existed (push subscribe = get everything).
export async function getNotificationPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<NotificationPreferences> {
  const { data } = await supabase
    .from("notification_preferences")
    .select("push_daily_digest, push_budget_alerts, telegram_daily_briefing")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return DEFAULT_NOTIFICATION_PREFERENCES;
  return {
    pushDailyDigest: data.push_daily_digest,
    pushBudgetAlerts: data.push_budget_alerts,
    telegramDailyBriefing: data.telegram_daily_briefing,
  };
}
