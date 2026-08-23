import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNotificationPreferences } from "@/lib/notificationPreferences";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }
  const preferences = await getNotificationPreferences(supabase, user.id);
  return NextResponse.json({ preferences });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const current = await getNotificationPreferences(supabase, user.id);
  const next = {
    push_daily_digest: typeof body?.pushDailyDigest === "boolean" ? body.pushDailyDigest : current.pushDailyDigest,
    push_budget_alerts:
      typeof body?.pushBudgetAlerts === "boolean" ? body.pushBudgetAlerts : current.pushBudgetAlerts,
    telegram_daily_briefing:
      typeof body?.telegramDailyBriefing === "boolean"
        ? body.telegramDailyBriefing
        : current.telegramDailyBriefing,
  };

  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: user.id, updated_at: new Date().toISOString(), ...next }, { onConflict: "user_id" });
  if (error) {
    console.error("PATCH /api/notification-preferences gagal:", error);
    return NextResponse.json({ error: "Gagal simpan preferensi." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
