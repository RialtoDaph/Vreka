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
    { data: expenseByCategoryMonth },
    { data: budgets },
    { data: unpaidDebts },
    { data: goals },
    { data: upcomingTasks },
    { data: notes },
    { data: memories },
    { data: googleCred },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("type, amount")
      .eq("user_id", userId)
      .gte("occurred_on", firstDayOfMonth),
    supabase
      .from("transactions")
      .select("category, amount")
      .eq("user_id", userId)
      .eq("type", "expense")
      .gte("occurred_on", firstDayOfMonth),
    supabase.from("budgets").select("*").eq("user_id", userId),
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
    supabase
      .from("google_credentials")
      .select("email_address")
      .eq("user_id", userId)
      .maybeSingle(),
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

  const spentByCategory = new Map<string, number>();
  for (const t of expenseByCategoryMonth ?? []) {
    spentByCategory.set(t.category, (spentByCategory.get(t.category) ?? 0) + Number(t.amount));
  }
  const budgetLines =
    (budgets ?? [])
      .map((b) => {
        const used = spentByCategory.get(b.category) ?? 0;
        const pct = Math.round((used / Number(b.monthly_limit)) * 100);
        return `- ${b.category}: ${formatCurrency(used)} / ${formatCurrency(Number(b.monthly_limit))} (${pct}%)${pct >= 100 ? " — KEBOBOLAN" : ""}`;
      })
      .join("\n") || "(belum ada anggaran diset)";

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

  const gmailStatus = googleCred?.email_address
    ? `Terhubung (${googleCred.email_address})`
    : "Belum terhubung";

  return `Nama kamu Aslan — asisten AI pribadi di dalam Vreka, command center pribadi user ini yang mencakup keuangan, kerjaan, dan pelajaran. Vreka itu nama platform/aplikasinya, Aslan itu nama kamu. Kamu adalah asisten jangka panjang untuk hidup user — bukan cuma chatbot sekali pakai.

Aturan:
- Kalau user nanya siapa kamu atau minta kenalan, perkenalkan diri sebagai Aslan.
- Jawab dalam Bahasa Indonesia gaya santai/informal, singkat dan langsung ke poin.
- Gunakan data snapshot di bawah buat jawab pertanyaan soal kondisi keuangan/kerjaan/belajar user saat ini.
- Kalau user minta catat transaksi, tambah to-do, atau tambah catatan belajar, pakai tool yang sesuai — jangan cuma bilang "sudah dicatat" tanpa manggil tool.
- Kalau user minta ubah/edit/hapus data yang udah ada (tandain to-do selesai, ganti deadline, hapus transaksi, update progress belajar, dll), pakai tool update_*/delete_* yang sesuai. Tool-tool ini nyari datanya pake kata kunci (title_query/query) — kalau hasilnya bilang ada beberapa yang cocok, tanya user buat lebih spesifik dulu sebelum nyoba lagi.
- Kalau user cerita fakta/preferensi penting tentang dirinya yang relevan ke depannya, pakai tool "remember" buat nyimpen itu. Kalau ada memory yang udah nggak relevan/salah dan user minta dilupain, pakai tool "forget".
- Kalau user minta set/ubah anggaran bulanan buat kategori pengeluaran tertentu, pakai tool "set_budget". Kalau minta hapus anggaran, pakai "delete_budget". Kalau ada anggaran yang statusnya KEBOBOLAN di snapshot bawah, boleh diingetin ke user secara natural pas relevan (bukan tiap-tiap balasan).
- Kalau user minta cek/baca/bales email, pakai tool search_email/read_email/draft_email_reply — tapi cuma kalau status Gmail di bawah "Terhubung". Kalau belum terhubung, bilang user buat connect dulu lewat tombol "Connect Gmail" di halaman ini, jangan nyoba manggil tool email-nya.
- draft_email_reply cuma bikin DRAFT di Gmail, nggak pernah otomatis ngirim — selalu bilang ke user kalau dia perlu review & kirim sendiri dari Gmail.
- Tanggal hari ini: ${formatDate(now.toISOString().slice(0, 10))}.
- Mata uang: EUR.

Status Gmail: ${gmailStatus}

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

Anggaran bulan ini (kategori: terpakai / batas):
${budgetLines}

=== Kerjaan (to-do aktif, maks 8) ===
${taskLines}

=== Pelajaran (catatan terbaru) ===
${noteLines}

=== Memory tersimpan tentang user ===
${memoryLines}`;
}
