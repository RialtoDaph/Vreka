import { createClient } from "@/lib/supabase/server";
import HudPanel from "@/components/HudPanel";
import StatCard from "@/components/StatCard";
import OverviewInsight from "@/components/OverviewInsight";
import AslanHero from "@/components/dashboard/AslanHero";
import QuickCommands from "@/components/dashboard/QuickCommands";
import StatusIntegrasi from "@/components/dashboard/StatusIntegrasi";
import MissionTimeline from "@/components/dashboard/MissionTimeline";
import LiveFeed, { type FeedItem } from "@/components/dashboard/LiveFeed";
import { Task } from "@/lib/types";
import { formatCurrency, formatDate, daysUntil } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const supabase = await createClient();

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [
    { data: txMonth },
    { data: budgets },
    { data: unpaidDebts },
    { data: goals },
    { data: upcomingTasks },
    { data: todayTasks },
    { data: overdueTasks },
    { data: notes },
    { data: gmailCred },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("type, category, amount")
      .gte("occurred_on", firstDayOfMonth),
    supabase.from("budgets").select("*"),
    supabase.from("debts").select("*").eq("status", "unpaid"),
    supabase.from("savings_goals").select("*").order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*")
      .neq("status", "done")
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase
      .from("tasks")
      .select("*")
      .neq("status", "done")
      .not("deadline", "is", null)
      .gte("deadline", startOfToday.toISOString())
      .lt("deadline", endOfToday.toISOString())
      .order("deadline", { ascending: true }),
    supabase
      .from("tasks")
      .select("*")
      .neq("status", "done")
      .not("deadline", "is", null)
      .lt("deadline", startOfToday.toISOString())
      .order("deadline", { ascending: true })
      .limit(3),
    supabase.from("study_notes").select("progress"),
    supabase.from("google_credentials").select("email_address").maybeSingle(),
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

  const spentByCategory = new Map<string, number>();
  for (const t of txMonth ?? []) {
    if (t.type !== "expense") continue;
    spentByCategory.set(t.category, (spentByCategory.get(t.category) ?? 0) + Number(t.amount));
  }

  // Live Intelligence Feed: gabungan tugas telat, utang jatuh tempo, target
  // tabungan yang keteteran, dan anggaran yang mepet/kebobolan jadi satu
  // stream alert.
  const feedItems: FeedItem[] = [];

  for (const b of budgets ?? []) {
    const used = spentByCategory.get(b.category) ?? 0;
    const pct = Math.round((used / Number(b.monthly_limit)) * 100);
    if (pct < 90) continue;
    feedItems.push({
      id: `budget-${b.id}`,
      tag: pct >= 100 ? "WARN" : "TIP",
      text:
        pct >= 100
          ? `Anggaran "${b.category}" kebobolan (${pct}%)`
          : `Anggaran "${b.category}" udah kepake ${pct}%`,
      meta: `${formatCurrency(used)} / ${formatCurrency(Number(b.monthly_limit))}`,
      href: "/dashboard/keuangan",
    });
  }

  for (const t of (overdueTasks ?? []) as Task[]) {
    feedItems.push({
      id: `task-${t.id}`,
      tag: "WARN",
      text: `Tugas "${t.title}" udah telat`,
      meta: t.deadline ? formatDate(t.deadline) : undefined,
      href: "/dashboard/kerjaan",
    });
  }

  for (const d of unpaidDebts ?? []) {
    if (d.direction !== "i_owe" || !d.due_date) continue;
    const days = daysUntil(d.due_date);
    if (days === null || days > 7) continue;
    feedItems.push({
      id: `debt-${d.id}`,
      tag: days < 0 ? "WARN" : "INFO",
      text:
        days < 0
          ? `Utang ke ${d.party_name} udah lewat jatuh tempo`
          : `Utang ke ${d.party_name} jatuh tempo ${days === 0 ? "hari ini" : `${days} hari lagi`}`,
      meta: formatCurrency(Number(d.amount)),
      href: "/dashboard/keuangan",
    });
  }

  for (const g of goals ?? []) {
    const pct = Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100);
    const days = daysUntil(g.deadline);
    if (days === null || days < 0 || days > 30 || pct >= 70) continue;
    feedItems.push({
      id: `goal-${g.id}`,
      tag: "TIP",
      text: `Target tabungan "${g.name}" baru ${pct}%, deadline ${days} hari lagi`,
      href: "/dashboard/keuangan",
    });
  }

  const voiceEnabled = !!process.env.ELEVENLABS_API_KEY;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
            Overview
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Ringkasan Sistem
          </h1>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-mint-glow border border-mint-glow/30 rounded-sm px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-mint-glow pulse-dot" />
          Optimal
        </span>
      </header>

      <AslanHero />

      <OverviewInsight />

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
        <QuickCommands />
        <StatusIntegrasi gmailEmail={gmailCred?.email_address ?? null} voiceEnabled={voiceEnabled} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <MissionTimeline tasks={(todayTasks ?? []) as Task[]} />
        <LiveFeed items={feedItems} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <HudPanel>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-white tracking-wide">
              Deadline Mendekat
            </h2>
            <a
              href="/dashboard/kerjaan"
              className="text-xs font-mono text-cyan-glow hover:underline"
            >
              Lihat semua →
            </a>
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
            <a
              href="/dashboard/keuangan"
              className="text-xs font-mono text-cyan-glow hover:underline"
            >
              Lihat semua →
            </a>
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
