import { Debt, SavingsGoal, StudyNote, Task } from "@/lib/types";
import { formatCurrency, formatDate, daysUntil } from "@/lib/format";

export type MemoryNodeType = "hub" | "task" | "finance" | "note" | "contact";

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
};

const HUBS: { id: string; label: string; r: number; anchor: [number, number, number]; href: string }[] = [
  { id: "h-kerjaan", label: "Kerjaan", r: 7, anchor: [70, 40, 0], href: "/dashboard/kerjaan" },
  { id: "h-keuangan", label: "Keuangan", r: 7, anchor: [-70, 40, 20], href: "/dashboard/keuangan" },
  { id: "h-pelajaran", label: "Pelajaran", r: 7, anchor: [-60, -50, -30], href: "/dashboard/pelajaran" },
  { id: "h-asisten", label: "Asisten", r: 6, anchor: [60, -50, -10], href: "/dashboard/asisten" },
];

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

type BuildInput = {
  tasks: Task[];
  goals: SavingsGoal[];
  debts: Debt[];
  notes: StudyNote[];
};

export function buildMemoryMapData({ tasks, goals, debts, notes }: BuildInput): MemoryMapData {
  const nodes: MemoryNode[] = HUBS.map((h) => ({
    id: h.id,
    label: h.label,
    type: "hub",
    r: h.r,
    color: TYPE_META.hub.color,
    typeLabel: TYPE_META.hub.typeLabel,
    anchor: h.anchor,
    x: h.anchor[0],
    y: h.anchor[1],
    z: h.anchor[2],
    href: h.href,
    fields: [],
  }));
  const edges: MemoryEdge[] = [];
  const hubById = Object.fromEntries(HUBS.map((h) => [h.id, h]));

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
    const [x, y, z] = hub ? scatterAround(hub.anchor, index, countInHub, 38) : [0, 0, 0];
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

  const activeTasks = tasks.slice(0, 8);
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
      ],
      i,
      activeTasks.length,
      "/dashboard/kerjaan"
    );
  });

  const activeGoals = goals.slice(0, 6);
  const unpaidDebts = debts.filter((d) => d.status === "unpaid").slice(0, 6);
  const financeCount = activeGoals.length + unpaidDebts.length;

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

  // Ring-connect the four hubs so the graph reads as one connected system.
  edges.push(
    ["h-kerjaan", "h-keuangan"],
    ["h-keuangan", "h-pelajaran"],
    ["h-pelajaran", "h-asisten"],
    ["h-asisten", "h-kerjaan"]
  );

  return { nodes, edges };
}
