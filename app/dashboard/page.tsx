import { createClient } from "@/lib/supabase/server";
import MemoryMapLoader from "@/components/dashboard/MemoryMapLoader";
import CommandPalette from "@/components/CommandPalette";
import { buildMemoryMapData } from "@/lib/memoryMap";
import { getCalendarAccessToken } from "@/lib/google/credentials";
import { listUpcomingEvents, type CalendarEvent } from "@/lib/google/calendar";
import { Task, SavingsGoal, Debt, StudyNote, Budget, Habit, HabitCheck, JournalEntry } from "@/lib/types";
import { daysUntil } from "@/lib/format";
import { buildDailyActivity } from "@/lib/assistantActivity";

const SPARKLINE_DAYS = 12;

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const supabase = await createClient();

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [
    { data: tasks },
    { data: goals },
    { data: debts },
    { data: notes },
    { data: budgets },
    { data: txMonth },
    { data: habits },
    { data: habitChecks },
    { data: journalEntries },
    {
      data: { user },
    },
    { data: gmailCred },
    { data: telegramLink },
    { count: memoryCount },
    { data: recentAuditLogs },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .neq("status", "done")
      .order("deadline", { ascending: true, nullsFirst: false }),
    supabase.from("savings_goals").select("*").order("created_at", { ascending: false }),
    supabase.from("debts").select("*").eq("status", "unpaid"),
    supabase.from("study_notes").select("*").order("updated_at", { ascending: false }),
    supabase.from("budgets").select("*"),
    supabase
      .from("transactions")
      .select("type, category, amount")
      .gte("occurred_on", firstDayOfMonth),
    supabase.from("habits").select("*").order("created_at", { ascending: true }),
    supabase.from("habit_checks").select("*"),
    supabase.from("journal_entries").select("*").order("entry_date", { ascending: false }),
    supabase.auth.getUser(),
    supabase.from("google_credentials").select("email_address, scope").maybeSingle(),
    supabase.from("telegram_links").select("linked_at").not("linked_at", "is", null).maybeSingle(),
    supabase.from("assistant_memories").select("*", { count: "exact", head: true }),
    supabase
      .from("assistant_audit_log")
      .select("created_at")
      .gte("created_at", new Date(now.getTime() - SPARKLINE_DAYS * 86400000).toISOString()),
  ]);

  let calendarEvents: CalendarEvent[] = [];
  let calendarConnected = false;
  if (user) {
    try {
      const cred = await getCalendarAccessToken(supabase, user.id);
      if ("accessToken" in cred) {
        calendarConnected = true;
        calendarEvents = await listUpcomingEvents(cred.accessToken, { maxResults: 8 });
      }
    } catch (err) {
      // A revoked/expired refresh token throws out of getCalendarAccessToken
      // (not one of its designed { error } responses) -- without this, that
      // used to crash the whole Memory Map page load instead of just
      // leaving the calendar widget showing "belum terhubung".
      console.error("Dashboard: gagal ambil data Google Calendar:", err);
    }
  }

  const voiceEnabled = !!process.env.OPENAI_API_KEY;

  const memoryMapData = buildMemoryMapData({
    tasks: (tasks ?? []) as Task[],
    goals: (goals ?? []) as SavingsGoal[],
    debts: (debts ?? []) as Debt[],
    notes: (notes ?? []) as StudyNote[],
    budgets: (budgets ?? []) as Budget[],
    transactionsThisMonth: txMonth ?? [],
    habits: (habits ?? []) as Habit[],
    habitChecks: (habitChecks ?? []) as HabitCheck[],
    journalEntries: (journalEntries ?? []) as JournalEntry[],
    calendarEvents,
    calendarConnected,
    gmailEmail: gmailCred?.email_address ?? null,
    voiceEnabled,
  });

  // Real vitals for the Memory Map's system-status panel -- model is always
  // on, so it's a flat +1 alongside however many of the other 3 real
  // integrations (Gmail/Calendar counts as one grant, Telegram, voice) are
  // actually connected.
  const integrationsConnected =
    1 + (gmailCred?.email_address ? 1 : 0) + (telegramLink?.linked_at ? 1 : 0) + (voiceEnabled ? 1 : 0);

  const hasOverdueTask = (tasks ?? []).some(
    (t: Task) => t.deadline && (daysUntil(t.deadline) ?? 0) < 0
  );

  const dailyActivity = buildDailyActivity(recentAuditLogs ?? [], SPARKLINE_DAYS).map((d) => d.count);

  return (
    <>
      <MemoryMapLoader
        data={memoryMapData}
        vitals={{
          memoryCount: memoryCount ?? 0,
          integrationsConnected,
          integrationsTotal: 4,
          hasOverdueTask,
          dailyActivity,
        }}
      />
      {/* This route sits outside app/dashboard/(chrome)/layout.tsx (full-bleed
          layout, no Sidebar), so ⌘K used to silently do nothing here even
          though it works everywhere else in the dashboard. */}
      <CommandPalette />
    </>
  );
}
