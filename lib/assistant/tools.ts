import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/categories";

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "remember",
    description:
      "Simpan satu fakta atau preferensi penting tentang user untuk diinget di percakapan berikutnya. Pakai ini kalau user cerita sesuatu yang bakal relevan ke depannya (tujuan hidup, preferensi, info personal, kebiasaan, dll).",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Fakta yang mau diinget, ditulis singkat dan jelas.",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "add_transaction",
    description:
      "Catat transaksi keuangan (pemasukan atau pengeluaran) ke modul Keuangan.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["income", "expense"] },
        category: {
          type: "string",
          description: `Kategori transaksi. Untuk income: ${INCOME_CATEGORIES.join(", ")}. Untuk expense: ${EXPENSE_CATEGORIES.join(", ")}.`,
        },
        amount: { type: "number", description: "Jumlah dalam EUR, harus > 0." },
        description: { type: "string", description: "Catatan opsional." },
        occurred_on: {
          type: "string",
          description: "Tanggal transaksi format YYYY-MM-DD. Default hari ini kalau nggak disebutkan.",
        },
      },
      required: ["type", "category", "amount"],
    },
  },
  {
    name: "add_task",
    description: "Tambah to-do baru ke modul Kerjaan.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        deadline: {
          type: "string",
          description: "Deadline dalam format ISO 8601 datetime, opsional.",
        },
        priority: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["title"],
    },
  },
  {
    name: "add_study_note",
    description: "Tambah catatan belajar baru ke modul Pelajaran.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        category: { type: "string" },
        progress: {
          type: "integer",
          description: "Progress 0-100, default 0.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description:
      "Ubah to-do yang udah ada (misal tandain selesai, ganti deadline/prioritas/judul). Cari to-do-nya pake title_query (boleh sebagian kata dari judulnya, nggak perlu persis).",
    input_schema: {
      type: "object",
      properties: {
        title_query: { type: "string", description: "Kata kunci buat nyari to-do yang mau diubah." },
        new_title: { type: "string" },
        new_description: { type: "string" },
        new_deadline: { type: "string", description: "ISO 8601 datetime." },
        new_priority: { type: "string", enum: ["low", "medium", "high"] },
        new_status: { type: "string", enum: ["todo", "done"] },
      },
      required: ["title_query"],
    },
  },
  {
    name: "delete_task",
    description: "Hapus to-do. Cari pake title_query (boleh sebagian kata dari judulnya).",
    input_schema: {
      type: "object",
      properties: { title_query: { type: "string" } },
      required: ["title_query"],
    },
  },
  {
    name: "delete_transaction",
    description:
      "Hapus transaksi keuangan. Cari pake query yang cocok ke kategori atau catatan/deskripsi transaksinya.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "update_study_note",
    description:
      "Ubah catatan belajar yang udah ada (misal update progress atau isi catatan). Cari pake title_query.",
    input_schema: {
      type: "object",
      properties: {
        title_query: { type: "string" },
        new_progress: { type: "integer", description: "0-100." },
        new_content: { type: "string" },
        new_category: { type: "string" },
      },
      required: ["title_query"],
    },
  },
  {
    name: "delete_study_note",
    description: "Hapus catatan belajar. Cari pake title_query.",
    input_schema: {
      type: "object",
      properties: { title_query: { type: "string" } },
      required: ["title_query"],
    },
  },
  {
    name: "forget",
    description:
      "Hapus satu memory/fakta yang tersimpan tentang user, kalau udah nggak relevan atau salah. Cari pake query yang cocok ke isi memory-nya.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
];

type FindResult = { error?: string; id?: string; label?: string };

async function findOneByColumn(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  column: string,
  query: string
): Promise<FindResult> {
  const q = String(query ?? "").trim();
  if (!q) return { error: "Query pencarian kosong." };
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .ilike(column, `%${q}%`)
    .limit(10);
  if (error) return { error: error.message };
  const rows = (data ?? []) as unknown as Array<Record<string, string>>;
  if (rows.length === 0) return { error: `Nggak nemu yang judulnya kayak "${q}".` };
  if (rows.length > 1) {
    return {
      error: `Ada ${rows.length} yang cocok: ${rows.map((r) => r[column]).join(", ")}. Sebutin lebih spesifik.`,
    };
  }
  return { id: rows[0].id, label: rows[0][column] };
}

async function findOneTransaction(
  supabase: SupabaseClient,
  userId: string,
  query: string
): Promise<FindResult> {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return { error: "Query pencarian kosong." };
  const { data, error } = await supabase
    .from("transactions")
    .select("id, category, description, amount")
    .eq("user_id", userId)
    .order("occurred_on", { ascending: false })
    .limit(200);
  if (error) return { error: error.message };
  const matches = (data ?? []).filter(
    (t) => t.category?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)
  );
  if (matches.length === 0) return { error: `Nggak nemu transaksi yang cocok sama "${q}".` };
  if (matches.length > 1) {
    return {
      error: `Ada ${matches.length} transaksi yang cocok: ${matches
        .map((t) => `${t.category}${t.description ? ` (${t.description})` : ""} ${t.amount}`)
        .join("; ")}. Sebutin lebih spesifik.`,
    };
  }
  const m = matches[0];
  return { id: m.id, label: `${m.category}${m.description ? ` (${m.description})` : ""}` };
}

export async function executeAssistantTool(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  input: Record<string, unknown>
): Promise<{ ok: boolean; result: string }> {
  switch (name) {
    case "remember": {
      const content = String(input.content ?? "").trim();
      if (!content) return { ok: false, result: "content kosong." };
      const { error } = await supabase
        .from("assistant_memories")
        .insert({ user_id: userId, content });
      if (error) return { ok: false, result: error.message };
      return { ok: true, result: "Tersimpan." };
    }

    case "add_transaction": {
      const type = input.type === "income" ? "income" : "expense";
      const amount = Number(input.amount);
      if (!amount || amount <= 0) return { ok: false, result: "amount harus > 0." };
      const category = String(input.category ?? "Lainnya");
      const { error } = await supabase.from("transactions").insert({
        user_id: userId,
        type,
        category,
        amount,
        description: input.description ? String(input.description) : null,
        occurred_on:
          typeof input.occurred_on === "string" && input.occurred_on
            ? input.occurred_on
            : new Date().toISOString().slice(0, 10),
      });
      if (error) return { ok: false, result: error.message };
      return { ok: true, result: "Transaksi dicatat." };
    }

    case "add_task": {
      const title = String(input.title ?? "").trim();
      if (!title) return { ok: false, result: "title kosong." };
      const priority =
        input.priority === "low" || input.priority === "high" ? input.priority : "medium";
      const { error } = await supabase.from("tasks").insert({
        user_id: userId,
        title,
        description: input.description ? String(input.description) : null,
        deadline: input.deadline ? String(input.deadline) : null,
        priority,
        status: "todo",
      });
      if (error) return { ok: false, result: error.message };
      return { ok: true, result: "To-do ditambahkan." };
    }

    case "add_study_note": {
      const title = String(input.title ?? "").trim();
      if (!title) return { ok: false, result: "title kosong." };
      let progress = Number(input.progress ?? 0);
      if (Number.isNaN(progress)) progress = 0;
      progress = Math.max(0, Math.min(100, Math.round(progress)));
      const { error } = await supabase.from("study_notes").insert({
        user_id: userId,
        title,
        content: input.content ? String(input.content) : null,
        category: input.category ? String(input.category) : "Umum",
        progress,
      });
      if (error) return { ok: false, result: error.message };
      return { ok: true, result: "Catatan belajar ditambahkan." };
    }

    case "update_task": {
      const found = await findOneByColumn(supabase, "tasks", userId, "title", String(input.title_query ?? ""));
      if (found.error) return { ok: false, result: found.error };
      const patch: Record<string, unknown> = {};
      if (typeof input.new_title === "string" && input.new_title.trim()) patch.title = input.new_title.trim();
      if (typeof input.new_description === "string") patch.description = input.new_description || null;
      if (typeof input.new_deadline === "string") patch.deadline = input.new_deadline || null;
      if (input.new_priority === "low" || input.new_priority === "medium" || input.new_priority === "high") {
        patch.priority = input.new_priority;
      }
      if (input.new_status === "todo" || input.new_status === "done") patch.status = input.new_status;
      if (Object.keys(patch).length === 0) return { ok: false, result: "Nggak ada perubahan yang disebutin." };
      const { error } = await supabase.from("tasks").update(patch).eq("id", found.id).eq("user_id", userId);
      if (error) return { ok: false, result: error.message };
      return { ok: true, result: `To-do "${found.label}" diupdate.` };
    }

    case "delete_task": {
      const found = await findOneByColumn(supabase, "tasks", userId, "title", String(input.title_query ?? ""));
      if (found.error) return { ok: false, result: found.error };
      const { error } = await supabase.from("tasks").delete().eq("id", found.id).eq("user_id", userId);
      if (error) return { ok: false, result: error.message };
      return { ok: true, result: `To-do "${found.label}" dihapus.` };
    }

    case "delete_transaction": {
      const found = await findOneTransaction(supabase, userId, String(input.query ?? ""));
      if (found.error) return { ok: false, result: found.error };
      const { error } = await supabase.from("transactions").delete().eq("id", found.id).eq("user_id", userId);
      if (error) return { ok: false, result: error.message };
      return { ok: true, result: `Transaksi "${found.label}" dihapus.` };
    }

    case "update_study_note": {
      const found = await findOneByColumn(supabase, "study_notes", userId, "title", String(input.title_query ?? ""));
      if (found.error) return { ok: false, result: found.error };
      const patch: Record<string, unknown> = {};
      if (typeof input.new_content === "string") patch.content = input.new_content || null;
      if (typeof input.new_category === "string" && input.new_category.trim()) {
        patch.category = input.new_category.trim();
      }
      if (input.new_progress !== undefined) {
        const p = Number(input.new_progress);
        if (!Number.isNaN(p)) patch.progress = Math.max(0, Math.min(100, Math.round(p)));
      }
      if (Object.keys(patch).length === 0) return { ok: false, result: "Nggak ada perubahan yang disebutin." };
      const { error } = await supabase.from("study_notes").update(patch).eq("id", found.id).eq("user_id", userId);
      if (error) return { ok: false, result: error.message };
      return { ok: true, result: `Catatan "${found.label}" diupdate.` };
    }

    case "delete_study_note": {
      const found = await findOneByColumn(supabase, "study_notes", userId, "title", String(input.title_query ?? ""));
      if (found.error) return { ok: false, result: found.error };
      const { error } = await supabase.from("study_notes").delete().eq("id", found.id).eq("user_id", userId);
      if (error) return { ok: false, result: error.message };
      return { ok: true, result: `Catatan "${found.label}" dihapus.` };
    }

    case "forget": {
      const q = String(input.query ?? "").trim().toLowerCase();
      if (!q) return { ok: false, result: "Query kosong." };
      const { data, error } = await supabase
        .from("assistant_memories")
        .select("id, content")
        .eq("user_id", userId)
        .limit(200);
      if (error) return { ok: false, result: error.message };
      const matches = (data ?? []).filter((m) => m.content.toLowerCase().includes(q));
      if (matches.length === 0) return { ok: false, result: `Nggak nemu memory yang cocok sama "${q}".` };
      if (matches.length > 1) {
        return {
          ok: false,
          result: `Ada ${matches.length} memory yang cocok: ${matches.map((m) => m.content).join(" | ")}. Sebutin lebih spesifik.`,
        };
      }
      const { error: delError } = await supabase
        .from("assistant_memories")
        .delete()
        .eq("id", matches[0].id)
        .eq("user_id", userId);
      if (delError) return { ok: false, result: delError.message };
      return { ok: true, result: "Memory dihapus." };
    }

    default:
      return { ok: false, result: `Tool tidak dikenal: ${name}` };
  }
}
