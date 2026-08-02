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

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
            Overview
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Memory Map
          </h1>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-mint-glow border border-mint-glow/30 rounded-sm px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-mint-glow pulse-dot" />
          Optimal
        </span>
      </header>

      <MemoryMapLoader data={memoryMapData} />
    </div>
  );
}
