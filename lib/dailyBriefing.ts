import { formatCurrency, formatDateTime } from "@/lib/format";

export type BriefingTask = { title: string };
export type BriefingBudgetAlert = { category: string; pct: number };
export type BriefingHabit = { title: string; streak: number };
export type BriefingCalendarEvent = { summary: string; start: string };

export type BriefingInput = {
  income: number;
  expense: number;
  /** Pre-filtered to categories at or above the alert threshold (>=90%). */
  budgetAlerts: BriefingBudgetAlert[];
  /** Not-done tasks with a deadline today. */
  dueTasks: BriefingTask[];
  /** Not-done tasks with a deadline in the past. */
  overdueTasks: BriefingTask[];
  /** Habits not yet checked today. */
  pendingHabits: BriefingHabit[];
  calendarEvents: BriefingCalendarEvent[];
  calendarConnected: boolean;
};

export type BriefingColor = "rose" | "amber" | "mint" | "cyan";

export type BriefingPriority = {
  tag: string;
  title: string;
  reason: string;
  action: string;
  href: string;
  color: BriefingColor;
};

export type BriefingSection = {
  title: string;
  color: BriefingColor;
  items: string[];
};

export type DailyBriefing = {
  priorities: BriefingPriority[];
  sections: BriefingSection[];
  summaryText: string;
};

// Fixed precedence, not a score -- overdue work always outranks a tight
// budget, which always outranks a habit streak. Each category contributes
// at most one candidate (the single worst instance), so this naturally
// caps out at 4 candidates before the top-3 slice below.
function buildPriorities(input: BriefingInput): BriefingPriority[] {
  const candidates: BriefingPriority[] = [];

  if (input.overdueTasks.length > 0) {
    candidates.push({
      tag: "Tugas telat",
      title: input.overdueTasks[0].title,
      reason:
        input.overdueTasks.length > 1
          ? `+${input.overdueTasks.length - 1} tugas telat lainnya`
          : "Udah lewat deadline",
      action: "Buka Kerjaan",
      href: "/dashboard/kerjaan",
      color: "rose",
    });
  }

  if (input.dueTasks.length > 0) {
    candidates.push({
      tag: "Deadline hari ini",
      title: input.dueTasks[0].title,
      reason:
        input.dueTasks.length > 1
          ? `+${input.dueTasks.length - 1} deadline lain hari ini`
          : "Jatuh tempo hari ini",
      action: "Buka Kerjaan",
      href: "/dashboard/kerjaan",
      color: "amber",
    });
  }

  if (input.budgetAlerts.length > 0) {
    const worst = [...input.budgetAlerts].sort((a, b) => b.pct - a.pct)[0];
    candidates.push({
      tag: worst.pct >= 100 ? "Anggaran kebobolan" : "Anggaran hampir jebol",
      title: `${worst.category} udah ${worst.pct}% dari batas`,
      reason: worst.pct >= 100 ? "Udah lewat batas bulan ini" : "Mendekati batas bulan ini",
      action: "Cek Anggaran",
      href: "/dashboard/keuangan",
      color: "amber",
    });
  }

  const atRiskHabit = [...input.pendingHabits]
    .filter((h) => h.streak > 0)
    .sort((a, b) => b.streak - a.streak)[0];
  if (atRiskHabit) {
    candidates.push({
      tag: "Streak berisiko",
      title: `${atRiskHabit.title} — ${atRiskHabit.streak} hari beruntun`,
      reason: "Belum dicentang hari ini, jangan putus",
      action: "Tandai Selesai",
      href: "/dashboard/kerjaan",
      color: "mint",
    });
  }

  return candidates.slice(0, 3);
}

function buildSections(input: BriefingInput): BriefingSection[] {
  const sections: BriefingSection[] = [];

  const kerjaanItems: string[] = [];
  if (input.dueTasks.length > 0) {
    kerjaanItems.push(
      `${input.dueTasks.length} deadline hari ini: ${input.dueTasks.map((t) => t.title).join(", ")}.`
    );
  }
  if (input.overdueTasks.length > 0) {
    kerjaanItems.push(
      `${input.overdueTasks.length} tugas udah telat: ${input.overdueTasks.map((t) => t.title).join(", ")}.`
    );
  }
  if (kerjaanItems.length === 0) kerjaanItems.push("Nggak ada deadline mendesak hari ini.");
  sections.push({ title: "Kerjaan hari ini", color: "amber", items: kerjaanItems });

  const keuanganItems: string[] = [
    `Saldo bulan ini ${formatCurrency(input.income - input.expense)} (masuk ${formatCurrency(input.income)} / keluar ${formatCurrency(input.expense)}).`,
  ];
  if (input.budgetAlerts.length > 0) {
    keuanganItems.push(
      `Anggaran mepet: ${input.budgetAlerts.map((b) => `${b.category} ${b.pct}%`).join(", ")}.`
    );
  }
  sections.push({ title: "Keuangan", color: "mint", items: keuanganItems });

  const kebiasaanItems =
    input.pendingHabits.length > 0
      ? [`Belum dicentang: ${input.pendingHabits.map((h) => h.title).join(", ")}.`]
      : ["Semua kebiasaan udah dicentang hari ini."];
  sections.push({ title: "Kebiasaan", color: "rose", items: kebiasaanItems });

  if (input.calendarConnected) {
    const items =
      input.calendarEvents.length > 0
        ? input.calendarEvents.map((e) => `${e.summary} (${formatDateTime(e.start)})`)
        : ["Nggak ada jadwal Google Calendar hari ini."];
    sections.push({ title: "Jadwal", color: "cyan", items });
  }

  return sections;
}

function buildSummaryText(
  dateLabel: string,
  priorities: BriefingPriority[],
  sections: BriefingSection[]
): string {
  const lines = [`Ringkasan hari ini, ${dateLabel}.`];
  if (priorities.length > 0) {
    lines.push(`Prioritas: ${priorities.map((p) => `${p.title} (${p.tag})`).join("; ")}.`);
  }
  for (const sec of sections) {
    lines.push(`${sec.title}: ${sec.items.join(" ")}`);
  }
  return lines.join(" ");
}

export function buildDailyBriefing(dateLabel: string, input: BriefingInput): DailyBriefing {
  const priorities = buildPriorities(input);
  const sections = buildSections(input);
  return { priorities, sections, summaryText: buildSummaryText(dateLabel, priorities, sections) };
}
