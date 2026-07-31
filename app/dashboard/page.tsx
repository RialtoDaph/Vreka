import { createClient } from "@/lib/supabase/server";
import HudPanel from "@/components/HudPanel";
import StatCard from "@/components/StatCard";
import { formatCurrency, formatDate, daysUntil } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const supabase = createClient();

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [
    { data: txMonth },
    { data: unpaidDebts },
    { data: goals },
    { data: upcomingTasks },
    { data: notes },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("type, amount")
      .gte("occurred_on", firstDayOfMonth),
    supabase.from("debts").select("*").eq("status", "unpaid"),
    supabase.from("savings_goals").select("*").order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*")
      .eq("status", "todo")
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase.from("study_notes").select("progress"),
  ]);

  const income = (txMonth ?? [])
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expense = (txMonth ?? [])
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const saldo = income - expense;

  const iOwe = (unpaidDebts ?? [])
    .filter((d) => d.direction === "i_owe")
    .reduce((sum, d) => sum + Number(d.amount), 0);
  const owedToMe = (unpaidDebts ?? [])
    .filter((d) => d.direction === "owed_to_me")
    .reduce((sum, d) => sum + Number(d.amount), 0);

  const avgProgress =
    notes && notes.length > 0
      ? Math.round(notes.reduce((sum, n) => sum + n.progress, 0) / notes.length)
      : 0;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
          Overview
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
          Ringkasan Sistem
        </h1>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Saldo Bulan Ini"
          value={formatCurrency(saldo)}
          hint={`Masuk ${formatCurrency(income)}`}
          tone={saldo >= 0 ? "mint" : "rose"}
        />
        <StatCard
          label="Pengeluaran Bulan Ini"
          value={formatCurrency(expense)}
          tone="amber"
        />
        <StatCard
          label="Utang Aktif"
          value={formatCurrency(iOwe)}
          hint={owedToMe > 0 ? `Piutang ${formatCurrency(owedToMe)}` : undefined}
          tone={iOwe > 0 ? "rose" : "mint"}
        />
        <StatCard
          label="Progress Belajar"
          value={`${avgProgress}%`}
          hint={`${notes?.length ?? 0} topik`}
          tone="cyan"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <HudPanel>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-white tracking-wide">
              Deadline Mendekat
            </h2>
            <Link
              href="/dashboard/kerjaan"
              className="text-xs font-mono text-cyan-glow hover:underline"
            >
              Lihat semua →
            </Link>
          </div>
          {upcomingTasks && upcomingTasks.length > 0 ? (
            <ul className="space-y-2.5">
              {upcomingTasks.map((task) => {
                const d = daysUntil(task.deadline);
                const urgent = d !== null && d <= 2;
                return (
                  <li
                    key={task.id}
                    className="flex items-center justify-between border-b border-line/60 pb-2.5 last:border-0 last:pb-0"
                  >
                    <span className="text-sm text-slate-200 truncate pr-3">
                      {task.title}
                    </span>
                    <span
                      className={`text-[11px] font-mono shrink-0 px-2 py-0.5 rounded-sm border ${
                        urgent
                          ? "text-rose-glow border-rose-glow/40 bg-rose-glow/5"
                          : "text-slate-400 border-line"
                      }`}
                    >
                      {task.deadline ? formatDate(task.deadline) : "Tanpa deadline"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              Gak ada tugas mendesak. Bersih.
            </p>
          )}
        </HudPanel>

        <HudPanel>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-white tracking-wide">
              Target Tabungan
            </h2>
            <Link
              href="/dashboard/keuangan"
              className="text-xs font-mono text-cyan-glow hover:underline"
            >
              Lihat semua →
            </Link>
          </div>
          {goals && goals.length > 0 ? (
            <ul className="space-y-3.5">
              {goals.slice(0, 4).map((goal) => {
                const pct = Math.min(
                  100,
                  Math.round((Number(goal.current_amount) / Number(goal.target_amount)) * 100)
                );
                return (
                  <li key={goal.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-200">{goal.name}</span>
                      <span className="font-mono text-xs text-slate-400">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-panel2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-glow rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Belum ada target tabungan.</p>
          )}
        </HudPanel>
      </div>
    </div>
  );
}
