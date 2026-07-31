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
];

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

    default:
      return { ok: false, result: `Tool tidak dikenal: ${name}` };
  }
}
