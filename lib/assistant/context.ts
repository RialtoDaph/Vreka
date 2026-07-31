import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCurrency, formatDate } from "@/lib/format";

export async function buildAssistantSystemPrompt(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
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
    { data: memories },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("type, amount")
      .eq("user_id", userId)
      .gte("occurred_on", firstDayOfMonth),
    supabase.from("debts").select("*").eq("user_id", userId).eq("status", "unpaid"),
    supabase
      .from("savings_goals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "todo")
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(8),
    supabase
      .from("study_notes")
      .select("title, category, progress")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("assistant_memories")
      .select("content")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  const income = (txMonth ?? [])
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expense = (txMonth ?? [])
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const iOwe = (unpaidDebts ?? [])
    .filter((d) => d.direction === "i_owe")
    .reduce((sum, d) => sum + Number(d.amount), 0);
  const owedToMe = (unpaidDebts ?? [])
    .filter((d) => d.direction === "owed_to_me")
    .reduce((sum, d) => sum + Number(d.amount), 0);

  const goalsLines =
    (goals ?? [])
      .map(
        (g) =>
          `- ${g.name}: ${formatCurrency(Number(g.current_amount))} / ${formatCurrency(Number(g.target_amount))}`
      )
      .join("\n") || "(belum ada target tabungan)";

  const debtLines =
    (unpaidDebts ?? [])
      .map(
        (d) =>
          `- ${d.direction === "i_owe" ? "Saya utang ke" : "Piutang dari"} ${d.party_name}: ${formatCurrency(Number(d.amount))}${d.due_date ? ` (jatuh tempo ${formatDate(d.due_date)})` : ""}`
      )
      .join("\n") || "(nggak ada utang/piutang aktif)";

  const taskLines =
    (upcomingTasks ?? [])
      .map(
        (t) =>
          `- [${t.priority}] ${t.title}${t.deadline ? ` (deadline ${formatDate(t.deadline)})` : ""}`
      )
      .join("\n") || "(nggak ada to-do aktif)";

  const noteLines =
    (notes ?? [])
      .map((n) => `- ${n.title} (${n.category ?? "Umum"}) — progress ${n.progress}%`)
      .join("\n") || "(belum ada catatan belajar)";

  const memoryLines =
    (memories ?? []).map((m) => `- ${m.content}`).join("\n") || "(belum ada memory tersimpan)";

  return `Nama kamu Aslan — asisten AI pribadi di dalam Vreka, command center pribadi user ini yang mencakup keuangan, kerjaan, dan pelajaran. Vreka itu nama platform/aplikasinya, Aslan itu nama kamu. Kamu adalah asisten jangka panjang untuk hidup user — bukan cuma chatbot sekali pakai.

Aturan:
- Kalau user nanya siapa kamu atau minta kenalan, perkenalkan diri sebagai Aslan.
- Jawab dalam Bahasa Indonesia gaya santai/informal, singkat dan langsung ke poin.
- Gunakan data snapshot di bawah buat jawab pertanyaan soal kondisi keuangan/kerjaan/belajar user saat ini.
- Kalau user minta catat transaksi, tambah to-do, atau tambah catatan belajar, pakai tool yang sesuai — jangan cuma bilang "sudah dicatat" tanpa manggil tool.
- Kalau user minta ubah/edit/hapus data yang udah ada (tandain to-do selesai, ganti deadline, hapus transaksi, update progress belajar, dll), pakai tool update_*/delete_* yang sesuai. Tool-tool ini nyari datanya pake kata kunci (title_query/query) — kalau hasilnya bilang ada beberapa yang cocok, tanya user buat lebih spesifik dulu sebelum nyoba lagi.
- Kalau user cerita fakta/preferensi penting tentang dirinya yang relevan ke depannya, pakai tool "remember" buat nyimpen itu. Kalau ada memory yang udah nggak relevan/salah dan user minta dilupain, pakai tool "forget".
- Tanggal hari ini: ${formatDate(now.toISOString().slice(0, 10))}.
- Mata uang: EUR.

=== Snapshot Keuangan (bulan ini) ===
Pemasukan: ${formatCurrency(income)}
Pengeluaran: ${formatCurrency(expense)}
Saldo: ${formatCurrency(income - expense)}
Utang aktif: ${formatCurrency(iOwe)}
Piutang aktif: ${formatCurrency(owedToMe)}

Detail utang/piutang:
${debtLines}

Target tabungan:
${goalsLines}

=== Kerjaan (to-do aktif, maks 8) ===
${taskLines}

=== Pelajaran (catatan terbaru) ===
${noteLines}

=== Memory tersimpan tentang user ===
${memoryLines}`;
}
