import { Budget, Debt, Habit, HabitCheck, JournalEntry, SavingsGoal, StudyNote, Task } from "@/lib/types";
import type { CalendarEvent } from "@/lib/google/calendar";
import { formatCurrency, formatDate, formatDateTime, daysUntil } from "@/lib/format";
import { computeStreak } from "@/lib/habits";

export type MemoryNodeType = "hub" | "task" | "finance" | "note" | "contact" | "event" | "journal";

export type MemoryField = { k: string; v: string };

export type MemoryNode = {
  id: string;
  label: string;
  type: MemoryNodeType;
  r: number;
  color: string;
  typeLabel: string;
  /** Fixed position for hub nodes; leaves drift via physics around theirs. */
  anchor?: [number, number, number];
  x: number;
  y: number;
  z: number;
  /** Parent node id this leaf hangs off of. */
  link?: string;
  fields: MemoryField[];
  href?: string;
};

export type MemoryEdge = [string, string];

export type MemoryMapData = {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
};

export const TYPE_META: Record<MemoryNodeType, { color: string; typeLabel: string }> = {
  hub: { color: "#4be8ff", typeLabel: "Modul" },
  task: { color: "#ffb454", typeLabel: "Kerjaan" },
  finance: { color: "#4bffb0", typeLabel: "Keuangan" },
  note: { color: "#ff5d7a", typeLabel: "Pelajaran" },
  contact: { color: "#b98bff", typeLabel: "Kontak" },
  event: { color: "#5b8dff", typeLabel: "Kalender" },
  journal: { color: "#f2d94b", typeLabel: "Jurnal" },
};

const HUB_DEFS: { id: string; label: string; angle: number; y: number; r: number; href: string }[] = [
  { id: "h-kerjaan", label: "Kerjaan", angle: 0, y: 45, r: 7, href: "/dashboard/kerjaan" },
  { id: "h-keuangan", label: "Keuangan", angle: 60, y: -45, r: 7, href: "/dashboard/keuangan" },
  { id: "h-pelajaran", label: "Pelajaran", angle: 120, y: 45, r: 6.5, href: "/dashboard/pelajaran" },
  { id: "h-kalender", label: "Kalender", angle: 180, y: -45, r: 6.5, href: "/dashboard/kalender" },
  { id: "h-jurnal", label: "Jurnal", angle: 240, y: 45, r: 6, href: "/dashboard/jurnal" },
  { id: "h-asisten", label: "Asisten", angle: 300, y: -45, r: 6, href: "/dashboard/asisten" },
];
const HUB_RADIUS = 85;

const PRIORITY_LABEL: Record<Task["priority"], string> = {
  high: "Tinggi",
  medium: "Sedang",
  low: "Rendah",
};

const PRIORITY_R: Record<Task["priority"], number> = {
  high: 3.6,
  medium: 3.0,
  low: 2.5,
};

const STATUS_LABEL: Record<Task["status"], string> = {
  todo: "Belum dikerjakan",
  in_progress: "Sedang dikerjakan",
  done: "Selesai",
};

function scatterAround(
  center: [number, number, number],
  index: number,
  count: number,
  radius: number
): [number, number, number] {
  const angle = (index / Math.max(count, 1)) * Math.PI * 2;
  const zJitter = ((index % 3) - 1) * 12;
  return [
    center[0] + Math.cos(angle) * radius,
    center[1] + Math.sin(angle) * radius,
    center[2] + zJitter,
  ];
}

function dueLabel(dateStr: string | null): string {
  if (!dateStr) return "Tanpa tenggat";
  const days = daysUntil(dateStr);
  return days !== null && days >= 0 ? `${days} hari` : formatDate(dateStr);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type BuildInput = {
  tasks: Task[];
  goals: SavingsGoal[];
  debts: Debt[];
  notes: StudyNote[];
  budgets: Budget[];
  transactionsThisMonth: { type: string; category: string; amount: number }[];
  habits: Habit[];
  habitChecks: HabitCheck[];
  journalEntries: JournalEntry[];
  calendarEvents: CalendarEvent[];
  calendarConnected: boolean;
  gmailEmail: string | null;
  voiceEnabled: boolean;
};

export function buildMemoryMapData({
  tasks,
  goals,
  debts,
  notes,
  budgets,
  transactionsThisMonth,
  habits,
  habitChecks,
  journalEntries,
  calendarEvents,
  calendarConnected,
  gmailEmail,
  voiceEnabled,
}: BuildInput): MemoryMapData {
  const nodes: MemoryNode[] = HUB_DEFS.map((h) => {
    const rad = (h.angle * Math.PI) / 180;
    const anchor: [number, number, number] = [
      Math.cos(rad) * HUB_RADIUS,
      h.y,
      Math.sin(rad) * HUB_RADIUS,
    ];
    return {
      id: h.id,
      label: h.label,
      type: "hub",
      r: h.r,
      color: TYPE_META.hub.color,
      typeLabel: TYPE_META.hub.typeLabel,
      anchor,
      x: anchor[0],
      y: anchor[1],
      z: anchor[2],
      href: h.href,
      fields: [],
    };
  });
  const edges: MemoryEdge[] = [];
  const hubById = Object.fromEntries(HUB_DEFS.map((h, i) => [h.id, nodes[i]]));

  function addLeaf(
    id: string,
    label: string,
    type: MemoryNodeType,
    hubId: string,
    r: number,
    fields: MemoryField[],
    index: number,
    countInHub: number,
    href?: string
  ) {
    const hub = hubById[hubId];
    const [x, y, z] = hub ? scatterAround(hub.anchor!, index, countInHub, 38) : [0, 0, 0];
    nodes.push({
      id,
      label,
      type,
      r,
      color: TYPE_META[type].color,
      typeLabel: TYPE_META[type].typeLabel,
      link: hubId,
      x,
      y,
      z,
      href,
      fields,
    });
    edges.push([hubId, id]);
  }

  // --- Kerjaan: tasks (todo + in_progress) + habits ---
  const activeTasks = tasks.filter((t) => t.status !== "done").slice(0, 8);
  const activeHabits = habits.slice(0, 6);
  const kerjaanCount = activeTasks.length + activeHabits.length;

  activeTasks.forEach((t, i) => {
    addLeaf(
      `t-${t.id}`,
      t.title,
      "task",
      "h-kerjaan",
      PRIORITY_R[t.priority],
      [
        { k: "Deadline", v: t.deadline ? formatDate(t.deadline) : "Tanpa deadline" },
        { k: "Prioritas", v: PRIORITY_LABEL[t.priority] },
        { k: "Status", v: STATUS_LABEL[t.status] },
      ],
      i,
      kerjaanCount,
      "/dashboard/kerjaan"
    );
  });

  const checksByHabit = new Map<string, Set<string>>();
  for (const c of habitChecks) {
    if (!checksByHabit.has(c.habit_id)) checksByHabit.set(c.habit_id, new Set());
    checksByHabit.get(c.habit_id)!.add(c.period);
  }
  activeHabits.forEach((h, i) => {
    const streak = computeStreak(checksByHabit.get(h.id) ?? new Set());
    addLeaf(
      `hb-${h.id}`,
      h.title,
      "task",
      "h-kerjaan",
      2.6,
      [{ k: "Streak", v: `${streak} hari` }],
      activeTasks.length + i,
      kerjaanCount,
      "/dashboard/kerjaan"
    );
  });

  // --- Keuangan: savings goals + unpaid debts + budgets ---
  const activeGoals = goals.slice(0, 6);
  const unpaidDebts = debts.filter((d) => d.status === "unpaid").slice(0, 6);
  const activeBudgets = budgets.slice(0, 6);
  const financeCount = activeGoals.length + unpaidDebts.length + activeBudgets.length;

  activeGoals.forEach((g, i) => {
    const pct = Math.min(
      100,
      Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100)
    );
    addLeaf(
      `g-${g.id}`,
      g.name,
      "finance",
      "h-keuangan",
      3.6,
      [
        { k: "Progress", v: `${pct}%` },
        { k: "Deadline", v: g.deadline ? dueLabel(g.deadline) : "Tanpa deadline" },
      ],
      i,
      financeCount,
      "/dashboard/keuangan"
    );
  });

  unpaidDebts.forEach((d, i) => {
    const debtNodeId = `d-${d.id}`;
    addLeaf(
      debtNodeId,
      d.direction === "i_owe" ? `Utang ke ${d.party_name}` : `Piutang dari ${d.party_name}`,
      "finance",
      "h-keuangan",
      3.0,
      [
        { k: "Jumlah", v: formatCurrency(Number(d.amount)) },
        { k: "Jatuh tempo", v: dueLabel(d.due_date) },
      ],
      activeGoals.length + i,
      financeCount,
      "/dashboard/keuangan"
    );

    // Contact node hangs off its debt node rather than the hub directly,
    // so a person only shows up when there's an active debt tying them in.
    const contactId = `c-${d.party_name}`;
    if (!nodes.some((n) => n.id === contactId)) {
      const debtNode = nodes.find((n) => n.id === debtNodeId)!;
      const [x, y, z] = scatterAround([debtNode.x, debtNode.y, debtNode.z], 0, 1, 14);
      nodes.push({
        id: contactId,
        label: d.party_name,
        type: "contact",
        r: 2.8,
        color: TYPE_META.contact.color,
        typeLabel: TYPE_META.contact.typeLabel,
        link: debtNodeId,
        x,
        y,
        z,
        href: "/dashboard/keuangan",
        fields: [{ k: "Relasi", v: d.direction === "i_owe" ? "Utang" : "Piutang" }],
      });
      edges.push([debtNodeId, contactId]);
    }
  });

  const spentByCategory = new Map<string, number>();
  for (const t of transactionsThisMonth) {
    if (t.type !== "expense") continue;
    spentByCategory.set(t.category, (spentByCategory.get(t.category) ?? 0) + Number(t.amount));
  }
  activeBudgets.forEach((b, i) => {
    const used = spentByCategory.get(b.category) ?? 0;
    const pct = Math.round((used / Number(b.monthly_limit)) * 100);
    addLeaf(
      `bg-${b.id}`,
      b.category,
      "finance",
      "h-keuangan",
      3.0,
      [
        { k: "Terpakai", v: `${formatCurrency(used)} / ${formatCurrency(Number(b.monthly_limit))}` },
        { k: "Persentase", v: `${pct}%` },
      ],
      activeGoals.length + unpaidDebts.length + i,
      financeCount,
      "/dashboard/keuangan"
    );
  });

  // --- Pelajaran: study notes ---
  const activeNotes = notes.slice(0, 8);
  activeNotes.forEach((n, i) => {
    addLeaf(
      `n-${n.id}`,
      n.title,
      "note",
      "h-pelajaran",
      3.2,
      [
        { k: "Progress", v: `${n.progress}%` },
        { k: "Kategori", v: n.category || "Umum" },
      ],
      i,
      activeNotes.length,
      "/dashboard/pelajaran"
    );
  });

  // --- Kalender: connected Google Calendar events ---
  const upcomingEvents = calendarEvents.slice(0, 8);
  upcomingEvents.forEach((e, i) => {
    addLeaf(
      `ev-${e.id}`,
      e.summary,
      "event",
      "h-kalender",
      3.0,
      [
        { k: "Waktu", v: formatDateTime(e.start) },
        ...(e.location ? [{ k: "Lokasi", v: e.location }] : []),
      ],
      i,
      upcomingEvents.length,
      "/dashboard/kalender"
    );
  });
  hubById["h-kalender"].fields = [
    { k: "Google Calendar", v: calendarConnected ? "Terhubung" : "Belum terhubung" },
  ];

  // --- Jurnal: recent journal entries ---
  const recentEntries = journalEntries.slice(0, 8);
  recentEntries.forEach((entry, i) => {
    addLeaf(
      `j-${entry.id}`,
      formatDate(entry.entry_date),
      "journal",
      "h-jurnal",
      3.0,
      [{ k: "Isi", v: truncate(entry.content, 80) }],
      i,
      recentEntries.length,
      "/dashboard/jurnal"
    );
  });

  // --- Asisten: integration status lives on the hub itself (no leaves) ---
  hubById["h-asisten"].fields = [
    { k: "Gmail", v: gmailEmail ? `Terhubung (${gmailEmail})` : "Belum terhubung" },
    { k: "Google Calendar", v: calendarConnected ? "Terhubung" : "Belum terhubung" },
    { k: "Voice (OpenAI)", v: voiceEnabled ? "Aktif" : "Nonaktif" },
  ];

  // Ring-connect all hubs in sequence so the graph reads as one connected system.
  const hubIds = HUB_DEFS.map((h) => h.id);
  for (let i = 0; i < hubIds.length; i++) {
    edges.push([hubIds[i], hubIds[(i + 1) % hubIds.length]]);
  }

  return { nodes, edges };
}
