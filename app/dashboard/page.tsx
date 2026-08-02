import { createClient } from "@/lib/supabase/server";
import MemoryMapLoader from "@/components/dashboard/MemoryMapLoader";
import { buildMemoryMapData } from "@/lib/memoryMap";
import { Task, SavingsGoal, Debt, StudyNote } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const supabase = await createClient();

  const [{ data: tasks }, { data: goals }, { data: debts }, { data: notes }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("status", "todo")
      .order("deadline", { ascending: true, nullsFirst: false }),
    supabase.from("savings_goals").select("*").order("created_at", { ascending: false }),
    supabase.from("debts").select("*").eq("status", "unpaid"),
    supabase.from("study_notes").select("*").order("updated_at", { ascending: false }),
  ]);

  const memoryMapData = buildMemoryMapData({
    tasks: (tasks ?? []) as Task[],
    goals: (goals ?? []) as SavingsGoal[],
    debts: (debts ?? []) as Debt[],
    notes: (notes ?? []) as StudyNote[],
  });

  return <MemoryMapLoader data={memoryMapData} />;
}
