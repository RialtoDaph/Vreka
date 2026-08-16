import type { LucideIcon } from "lucide-react";
import {
  Orbit,
  Sun,
  Wallet,
  ListTodo,
  StickyNote,
  BookOpen,
  Calendar,
  NotebookPen,
  History,
  Sparkles,
  Cpu,
} from "lucide-react";

export type NavModule = {
  href: string;
  label: string;
  icon: LucideIcon;
  keywords?: string;
};

// Single source of truth for the module list -- both Sidebar (every-page
// nav) and CommandPalette (⌘K) render off this instead of maintaining their
// own near-identical copies, which had drifted out of sync (Canvas and AI
// Core were each missing from one of the two).
export const NAV_MODULES: NavModule[] = [
  { href: "/dashboard", label: "Memory Map", icon: Orbit, keywords: "overview graph" },
  {
    href: "/dashboard/ringkasan",
    label: "Ringkasan",
    icon: Sun,
    keywords: "ringkasan harian briefing pagi prioritas",
  },
  {
    href: "/dashboard/keuangan",
    label: "Keuangan",
    icon: Wallet,
    keywords: "transaksi anggaran analitik pos tetap utang piutang tabungan struk",
  },
  { href: "/dashboard/kerjaan", label: "Kerjaan", icon: ListTodo, keywords: "to-do kanban kebiasaan habit project" },
  { href: "/dashboard/canvas", label: "Canvas", icon: StickyNote, keywords: "canvas papan sticky note whiteboard" },
  { href: "/dashboard/pelajaran", label: "Pelajaran", icon: BookOpen, keywords: "kuis catatan belajar timer resource" },
  { href: "/dashboard/kalender", label: "Kalender", icon: Calendar, keywords: "jadwal deadline agenda" },
  { href: "/dashboard/jurnal", label: "Jurnal", icon: NotebookPen, keywords: "diary catatan harian refleksi" },
  {
    href: "/dashboard/timeline",
    label: "Timeline",
    icon: History,
    keywords: "timeline kehidupan milestone biografi riwayat hidup",
  },
  {
    href: "/dashboard/asisten",
    label: "Aslan",
    icon: Sparkles,
    keywords: "chat asisten ai gmail telegram export aktivitas",
  },
  {
    href: "/dashboard/ai-core",
    label: "AI Core",
    icon: Cpu,
    keywords: "integrasi status gmail telegram push notifikasi 2fa aktivitas",
  },
];
