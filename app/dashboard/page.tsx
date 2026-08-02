import { createClient } from "@/lib/supabase/server";
import MemoryMapLoader from "@/components/dashboard/MemoryMapLoader";
import { buildMemoryMapData } from "@/lib/memoryMap";
import { getCalendarAccessToken } from "@/lib/google/credentials";
import { listUpcomingEvents, type CalendarEvent } from "@/lib/google/calendar";
import { Task, SavingsGoal, Debt, StudyNote, Budget, Habit, HabitCheck, JournalEntry } from "@/lib/types";

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
    voiceEnabled: !!process.env.ELEVENLABS_API_KEY,
  });

  return <MemoryMapLoader data={memoryMapData} />;
}
