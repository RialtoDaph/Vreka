import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken, listMessages, getMessage } from "@/lib/google/gmail";
import { listUpcomingEvents } from "@/lib/google/calendar";
import { sendTelegramMessage } from "@/lib/telegram/bot";
import { sendPushToUser } from "@/lib/push";
import { formatCurrency, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs once a day (vercel.json). Does two independent jobs in one cron slot
// — Gmail unread-email digest and a Telegram morning briefing — rather than
// registering a second Vercel Cron entry, since Hobby-plan projects only get
// a couple of cron slots and this app already spends one on recurring-post.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  // Explicit `!cronSecret` check so a deployment that forgot to set
  // CRON_SECRET fails closed instead of the expected value silently
  // becoming the literal string "Bearer undefined".
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const results: Array<{ user_id: string; status: string }> = [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const { data: connections, error } = await admin
      .from("google_credentials")
      .select("user_id, refresh_token");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey });

    for (const conn of connections ?? []) {
      try {
        const accessToken = await refreshAccessToken(conn.refresh_token);
        const matches = await listMessages(accessToken, "is:unread in:inbox newer_than:2d", 15);

        if (matches.length === 0) {
          results.push({ user_id: conn.user_id, status: "skip: no unread email" });
          continue;
        }

        const details = await Promise.all(matches.map((m) => getMessage(accessToken, m.id)));
        const emailList = details
          .map((d) => `- Dari: ${d.from}\n  Subjek: ${d.subject}\n  Cuplikan: ${d.snippet}`)
          .join("\n");

        const response = await anthropic.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 500,
          system:
            "Kamu bikin ringkasan email masuk buat user, Bahasa Indonesia santai. Fokus ke email yang keliatan penting/butuh respon (ada pertanyaan, permintaan meeting, deadline, tagihan). Format singkat per-poin, jangan bertele-tele. Email yang keliatan cuma notifikasi/promosi boleh diringkas jadi satu baris gabungan atau di-skip.",
          messages: [
            {
              role: "user",
              content: `Ada ${details.length} email belum dibaca dalam 2 hari terakhir:\n\n${emailList}\n\nBikin ringkasan singkat, dan tandain mana yang kayaknya perlu dibales.`,
            },
          ],
        });

        const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
        const digest = textBlock?.text?.trim();
        if (digest) {
          await admin.from("assistant_messages").insert({
            user_id: conn.user_id,
            role: "assistant",
            content: `📬 Ringkasan email hari ini:\n\n${digest}`,
          });
          results.push({ user_id: conn.user_id, status: "digest posted" });
        } else {
          results.push({ user_id: conn.user_id, status: "skip: empty digest" });
        }
      } catch (err) {
        results.push({
          user_id: conn.user_id,
          status: `error: ${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    }
  }

  if (process.env.TELEGRAM_BOT_TOKEN) {
    const { data: links } = await admin
      .from("telegram_links")
      .select("user_id, chat_id")
      .not("chat_id", "is", null)
      .not("linked_at", "is", null);

    for (const link of links ?? []) {
      if (!link.chat_id) continue;
      try {
        const briefing = await buildMorningBriefing(admin, link.user_id);
        await sendTelegramMessage(link.chat_id, briefing.text);
        results.push({ user_id: link.user_id, status: "morning briefing sent" });
      } catch (err) {
        results.push({
          user_id: link.user_id,
          status: `briefing error: ${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    }
  }

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    const { data: pushRows } = await admin.from("push_subscriptions").select("user_id");
    const userIds = Array.from(new Set((pushRows ?? []).map((p) => p.user_id)));

    for (const userId of userIds) {
      try {
        const briefing = await buildMorningBriefing(admin, userId);
        const { sent } = await sendPushToUser(admin, userId, {
          title: "🌅 Ringkasan Pagi",
          body: briefing.pushBody,
          url: "/dashboard",
        });
        results.push({
          user_id: userId,
          status: sent > 0 ? `push sent to ${sent} device(s)` : "push: no active subscription",
        });
      } catch (err) {
        results.push({
          user_id: userId,
          status: `push error: ${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    }
  }

  return NextResponse.json({ results });
}

type Briefing = { text: string; pushBody: string };

async function buildMorningBriefing(admin: SupabaseClient, userId: string): Promise<Briefing> {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [
    { data: txMonth },
    { data: budgets },
    { data: dueTasks },
    { data: overdueTasks },
    { data: habits },
    { data: habitChecks },
    { data: googleCred },
  ] = await Promise.all([
    admin.from("transactions").select("type, category, amount").eq("user_id", userId).gte("occurred_on", firstDayOfMonth),
    admin.from("budgets").select("category, monthly_limit").eq("user_id", userId),
    admin
      .from("tasks")
      .select("title, priority")
      .eq("user_id", userId)
      .neq("status", "done")
      .not("deadline", "is", null)
      .gte("deadline", startOfToday.toISOString())
      .lt("deadline", endOfToday.toISOString()),
    admin
      .from("tasks")
      .select("title")
      .eq("user_id", userId)
      .neq("status", "done")
      .not("deadline", "is", null)
      .lt("deadline", startOfToday.toISOString())
      .limit(5),
    admin.from("habits").select("id, title").eq("user_id", userId),
    admin.from("habit_checks").select("habit_id, period").eq("user_id", userId),
    admin.from("google_credentials").select("refresh_token, scope").eq("user_id", userId).maybeSingle(),
  ]);

  const income = (txMonth ?? []).filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = (txMonth ?? []).filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  const spentByCategory = new Map<string, number>();
  for (const t of txMonth ?? []) {
    if (t.type !== "expense") continue;
    spentByCategory.set(t.category, (spentByCategory.get(t.category) ?? 0) + Number(t.amount));
  }
  const budgetAlerts = (budgets ?? [])
    .map((b) => ({
      category: b.category,
      pct: Math.round(((spentByCategory.get(b.category) ?? 0) / Number(b.monthly_limit)) * 100),
    }))
    .filter((x) => x.pct >= 90);

  const today = now.toISOString().slice(0, 10);
  const checksByHabit = new Map<string, Set<string>>();
  for (const c of habitChecks ?? []) {
    if (!checksByHabit.has(c.habit_id)) checksByHabit.set(c.habit_id, new Set());
    checksByHabit.get(c.habit_id)!.add(c.period);
  }
  const pendingHabits = (habits ?? []).filter((h) => !(checksByHabit.get(h.id) ?? new Set()).has(today));

  const lines: string[] = ["🌅 Pagi! Ringkasan hari ini dari Aslan:"];

  lines.push(
    `\n💰 Saldo bulan ini: ${formatCurrency(income - expense)} (masuk ${formatCurrency(income)} / keluar ${formatCurrency(expense)})`
  );

  if (budgetAlerts.length > 0) {
    lines.push(
      "\n⚠️ Anggaran mepet/kebobolan:\n" + budgetAlerts.map((x) => `- ${x.category}: ${x.pct}%`).join("\n")
    );
  }

  if (dueTasks && dueTasks.length > 0) {
    lines.push("\n✅ Tugas due hari ini:\n" + dueTasks.map((t) => `- [${t.priority}] ${t.title}`).join("\n"));
  }

  if (overdueTasks && overdueTasks.length > 0) {
    lines.push("\n🔴 Tugas telat:\n" + overdueTasks.map((t) => `- ${t.title}`).join("\n"));
  }

  if (pendingHabits.length > 0) {
    lines.push("\n🔥 Kebiasaan belum dicentang:\n" + pendingHabits.map((h) => `- ${h.title}`).join("\n"));
  }

  if (googleCred?.refresh_token && googleCred.scope?.includes("calendar")) {
    try {
      const accessToken = await refreshAccessToken(googleCred.refresh_token);
      const events = await listUpcomingEvents(accessToken, { maxResults: 5, timeMax: endOfToday });
      if (events.length > 0) {
        lines.push(
          "\n📅 Jadwal hari ini:\n" + events.map((e) => `- ${e.summary} (${formatDateTime(e.start)})`).join("\n")
        );
      }
    } catch {
      // Kalender itu bonus buat briefing ini — gagal ambil bukan alasan buat
      // nge-skip seluruh briefing-nya.
    }
  }

  const pushParts: string[] = [`Saldo ${formatCurrency(income - expense)}`];
  if (budgetAlerts.length > 0) pushParts.push(`${budgetAlerts.length} anggaran mepet`);
  if (dueTasks && dueTasks.length > 0) pushParts.push(`${dueTasks.length} tugas due`);
  if (overdueTasks && overdueTasks.length > 0) pushParts.push(`${overdueTasks.length} tugas telat`);

  return { text: lines.join("\n"), pushBody: pushParts.join(" · ") };
}
