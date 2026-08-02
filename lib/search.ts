import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCurrency, formatDate } from "@/lib/format";

export type SearchResultSource = "transaction" | "task" | "note" | "journal" | "memory";

export type SearchResultItem = {
  source: SearchResultSource;
  id: string;
  title: string;
  snippet: string;
  date: string;
  href: string;
};

const SOURCE_HREF: Record<SearchResultSource, string> = {
  transaction: "/dashboard/keuangan",
  task: "/dashboard/kerjaan",
  note: "/dashboard/pelajaran",
  journal: "/dashboard/jurnal",
  memory: "/dashboard/asisten",
};

function truncate(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

// Runs one tsvector-backed search per table (see migration 0014_search.sql)
// and merges the results, newest first. Used by both the global search API
// (Command Palette) and Aslan's search_records tool, so the two surfaces
// stay in sync instead of drifting apart.
export async function searchAll(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  limitPerSource = 5
): Promise<SearchResultItem[]> {
  const q = query.trim();
  if (!q) return [];

  const [tx, tasks, notes, journal, memories] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, category, description, amount, occurred_on")
      .eq("user_id", userId)
      .textSearch("search_vector", q, { type: "websearch", config: "simple" })
      .order("occurred_on", { ascending: false })
      .limit(limitPerSource),
    supabase
      .from("tasks")
      .select("id, title, status, deadline, created_at")
      .eq("user_id", userId)
      .textSearch("search_vector", q, { type: "websearch", config: "simple" })
      .order("created_at", { ascending: false })
      .limit(limitPerSource),
    supabase
      .from("study_notes")
      .select("id, title, category, progress, updated_at")
      .eq("user_id", userId)
      .textSearch("search_vector", q, { type: "websearch", config: "simple" })
      .order("updated_at", { ascending: false })
      .limit(limitPerSource),
    supabase
      .from("journal_entries")
      .select("id, content, entry_date")
      .eq("user_id", userId)
      .textSearch("search_vector", q, { type: "websearch", config: "simple" })
      .order("entry_date", { ascending: false })
      .limit(limitPerSource),
    supabase
      .from("assistant_memories")
      .select("id, content, created_at")
      .eq("user_id", userId)
      .textSearch("search_vector", q, { type: "websearch", config: "simple" })
      .order("created_at", { ascending: false })
      .limit(limitPerSource),
  ]);

  const results: SearchResultItem[] = [];

  type TxRow = { id: string; category: string; description: string | null; amount: number; occurred_on: string };
  for (const t of (tx.data ?? []) as TxRow[]) {
    results.push({
      source: "transaction",
      id: t.id,
      title: t.description ? `${t.category} — ${t.description}` : t.category,
      snippet: `${formatCurrency(Number(t.amount))} · ${formatDate(t.occurred_on)}`,
      date: t.occurred_on,
      href: SOURCE_HREF.transaction,
    });
  }

  type TaskRow = { id: string; title: string; status: string; deadline: string | null; created_at: string };
  for (const t of (tasks.data ?? []) as TaskRow[]) {
    results.push({
      source: "task",
      id: t.id,
      title: t.title,
      snippet: t.deadline ? `${t.status} · deadline ${formatDate(t.deadline)}` : t.status,
      date: t.created_at,
      href: SOURCE_HREF.task,
    });
  }

  type NoteRow = { id: string; title: string; category: string | null; progress: number; updated_at: string };
  for (const n of (notes.data ?? []) as NoteRow[]) {
    results.push({
      source: "note",
      id: n.id,
      title: n.title,
      snippet: `${n.category ?? "Umum"} · progress ${n.progress}%`,
      date: n.updated_at,
      href: SOURCE_HREF.note,
    });
  }

  type JournalRow = { id: string; content: string; entry_date: string };
  for (const j of (journal.data ?? []) as JournalRow[]) {
    results.push({
      source: "journal",
      id: j.id,
      title: formatDate(j.entry_date),
      snippet: truncate(j.content),
      date: j.entry_date,
      href: SOURCE_HREF.journal,
    });
  }

  type MemoryRow = { id: string; content: string; created_at: string };
  for (const m of (memories.data ?? []) as MemoryRow[]) {
    results.push({
      source: "memory",
      id: m.id,
      title: "Memory",
      snippet: truncate(m.content),
      date: m.created_at,
      href: SOURCE_HREF.memory,
    });
  }

  results.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return results;
}
