import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/categories";
import { getGmailAccessToken } from "@/lib/google/credentials";
import { listMessages, getMessage, createDraftReply, type ParsedEmail } from "@/lib/google/gmail";

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
    name: "add_subtask",
    description:
      "Tambah sub-task (langkah kecil) ke satu to-do yang udah ada. Cari to-do-nya pake title_query.",
    input_schema: {
      type: "object",
      properties: {
        title_query: { type: "string", description: "Kata kunci buat nyari to-do induknya." },
        subtask_title: { type: "string", description: "Judul sub-task yang mau ditambah." },
      },
      required: ["title_query", "subtask_title"],
    },
  },
  {
    name: "toggle_subtask",
    description:
      "Tandain sub-task selesai atau belum. Cari to-do induknya pake title_query, dan sub-task-nya pake subtask_query.",
    input_schema: {
      type: "object",
      properties: {
        title_query: { type: "string", description: "Kata kunci buat nyari to-do induknya." },
        subtask_query: { type: "string", description: "Kata kunci buat nyari sub-task-nya." },
        done: { type: "boolean", description: "true = tandain selesai, false = buka lagi." },
      },
      required: ["title_query", "subtask_query", "done"],
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
        new_status: { type: "string", enum: ["todo", "in_progress", "done"] },
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
    name: "set_budget",
    description:
      "Set atau update batas anggaran bulanan buat satu kategori pengeluaran. Kalau kategori itu udah punya anggaran, batasnya diupdate (bukan bikin duplikat).",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: `Kategori pengeluaran. Salah satu dari: ${EXPENSE_CATEGORIES.join(", ")}.`,
        },
        monthly_limit: { type: "number", description: "Batas pengeluaran per bulan dalam EUR, harus > 0." },
      },
      required: ["category", "monthly_limit"],
    },
  },
  {
    name: "delete_budget",
    description: "Hapus anggaran bulanan untuk satu kategori pengeluaran.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Nama kategori yang anggarannya mau dihapus." },
      },
      required: ["category"],
    },
  },
  {
    name: "toggle_habit",
    description:
      "Tandain kebiasaan yang dilacak udah dilakuin hari ini. Cari kebiasaannya pake title_query.",
    input_schema: {
      type: "object",
      properties: {
        title_query: { type: "string", description: "Kata kunci buat nyari kebiasaannya." },
      },
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
  {
    name: "search_email",
    description:
      "Cari email di Gmail user. Query pake sintaks pencarian Gmail (misal 'is:unread', 'from:someone@x.com', 'subject:invoice') atau kata kunci bebas. Balikin daftar ringkas (subjek, pengirim, tanggal, cuplikan) dari beberapa email teratas yang cocok. Cuma bisa dipake kalau user udah connect Gmail.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Query pencarian Gmail, kosongin buat email terbaru di inbox." },
      },
      required: ["query"],
    },
  },
  {
    name: "read_email",
    description:
      "Baca isi lengkap satu email tertentu. Cari pake query yang cocok ke subjek/pengirim/isi (misal 'email dari boss soal meeting'). Kalau ada beberapa yang cocok, bakal dikasih daftar buat diperjelas dulu sebelum baca.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "draft_email_reply",
    description:
      "Bikin DRAFT balesan ke satu email tertentu di Gmail — nongol di folder Draft, BUKAN otomatis kekirim. User yang review & kirim sendiri dari Gmail. Cari email yang mau dibales pake query.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Kata kunci buat nyari email yang mau dibales." },
        body: { type: "string", description: "Isi balesan yang mau ditulis." },
      },
      required: ["query", "body"],
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

type EmailFindResult = { error?: string; email?: ParsedEmail; accessToken?: string };

async function findOneEmail(
  supabase: SupabaseClient,
  userId: string,
  query: string
): Promise<EmailFindResult> {
  const accessToken = await getGmailAccessToken(supabase, userId);
  if (!accessToken) {
    return { error: "Gmail belum di-connect. Suruh user klik \"Connect Gmail\" di halaman Aslan dulu." };
  }
  const q = String(query ?? "").trim();
  const matches = await listMessages(accessToken, q || "in:inbox", 5);
  if (matches.length === 0) return { error: `Nggak nemu email yang cocok sama "${q}".` };
  if (matches.length === 1) {
    const email = await getMessage(accessToken, matches[0].id);
    return { email, accessToken };
  }
  const details = await Promise.all(matches.map((m) => getMessage(accessToken, m.id)));
  return {
    error: `Ada ${details.length} email yang cocok: ${details
      .map((d) => `"${d.subject}" dari ${d.from}`)
      .join("; ")}. Sebutin lebih spesifik.`,
  };
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

    case "add_subtask": {
      const found = await findOneByColumn(supabase, "tasks", userId, "title", String(input.title_query ?? ""));
      if (found.error) return { ok: false, result: found.error };
      const subtaskTitle = String(input.subtask_title ?? "").trim();
      if (!subtaskTitle) return { ok: false, result: "subtask_title kosong." };
      const { error } = await supabase.from("task_subtasks").insert({
        user_id: userId,
        task_id: found.id,
        title: subtaskTitle,
      });
      if (error) return { ok: false, result: error.message };
      return { ok: true, result: `Sub-task "${subtaskTitle}" ditambahkan ke "${found.label}".` };
    }

    case "toggle_subtask": {
      const found = await findOneByColumn(supabase, "tasks", userId, "title", String(input.title_query ?? ""));
      if (found.error) return { ok: false, result: found.error };
      const q = String(input.subtask_query ?? "").trim().toLowerCase();
      if (!q) return { ok: false, result: "subtask_query kosong." };
      const { data, error } = await supabase
        .from("task_subtasks")
        .select("id, title")
        .eq("task_id", found.id)
        .eq("user_id", userId);
      if (error) return { ok: false, result: error.message };
      const matches = (data ?? []).filter((s) => s.title.toLowerCase().includes(q));
      if (matches.length === 0) {
        return { ok: false, result: `Nggak nemu sub-task yang cocok sama "${q}" di "${found.label}".` };
      }
      if (matches.length > 1) {
        return {
          ok: false,
          result: `Ada ${matches.length} sub-task yang cocok: ${matches.map((m) => m.title).join(", ")}. Sebutin lebih spesifik.`,
        };
      }
      const done = input.done === true;
      const { error: updateError } = await supabase
        .from("task_subtasks")
        .update({ done })
        .eq("id", matches[0].id)
        .eq("user_id", userId);
      if (updateError) return { ok: false, result: updateError.message };
      return { ok: true, result: `Sub-task "${matches[0].title}" ditandain ${done ? "selesai" : "belum selesai"}.` };
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
      if (input.new_status === "todo" || input.new_status === "in_progress" || input.new_status === "done") {
        patch.status = input.new_status;
      }
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

    case "set_budget": {
      const category = String(input.category ?? "").trim();
      if (!category) return { ok: false, result: "category kosong." };
      const monthlyLimit = Number(input.monthly_limit);
      if (!monthlyLimit || monthlyLimit <= 0) return { ok: false, result: "monthly_limit harus > 0." };
      const { error } = await supabase
        .from("budgets")
        .upsert(
          { user_id: userId, category, monthly_limit: monthlyLimit },
          { onConflict: "user_id,category" }
        );
      if (error) return { ok: false, result: error.message };
      return { ok: true, result: `Anggaran "${category}" diset ke ${monthlyLimit}/bulan.` };
    }

    case "delete_budget": {
      const category = String(input.category ?? "").trim();
      if (!category) return { ok: false, result: "category kosong." };
      const { error } = await supabase
        .from("budgets")
        .delete()
        .eq("user_id", userId)
        .eq("category", category);
      if (error) return { ok: false, result: error.message };
      return { ok: true, result: `Anggaran "${category}" dihapus.` };
    }

    case "toggle_habit": {
      const found = await findOneByColumn(supabase, "habits", userId, "title", String(input.title_query ?? ""));
      if (found.error) return { ok: false, result: found.error };
      const today = new Date().toISOString().slice(0, 10);
      const { data: existing } = await supabase
        .from("habit_checks")
        .select("id")
        .eq("habit_id", found.id)
        .eq("period", today)
        .maybeSingle();
      if (existing) {
        return { ok: true, result: `"${found.label}" udah dicentang hari ini.` };
      }
      const { error } = await supabase.from("habit_checks").insert({
        user_id: userId,
        habit_id: found.id,
        period: today,
      });
      if (error) return { ok: false, result: error.message };
      return { ok: true, result: `"${found.label}" ditandain selesai hari ini.` };
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

    case "search_email": {
      const accessToken = await getGmailAccessToken(supabase, userId);
      if (!accessToken) {
        return {
          ok: false,
          result: "Gmail belum di-connect. Suruh user klik \"Connect Gmail\" di halaman Aslan dulu.",
        };
      }
      const q = String(input.query ?? "").trim() || "in:inbox";
      const matches = await listMessages(accessToken, q, 8);
      if (matches.length === 0) return { ok: true, result: "Nggak ada email yang cocok." };
      const details = await Promise.all(matches.map((m) => getMessage(accessToken, m.id)));
      const summary = details
        .map((d) => `- "${d.subject}" dari ${d.from} (${d.date}): ${d.snippet}`)
        .join("\n");
      return { ok: true, result: summary };
    }

    case "read_email": {
      const found = await findOneEmail(supabase, userId, String(input.query ?? ""));
      if (found.error) return { ok: false, result: found.error };
      const e = found.email!;
      return {
        ok: true,
        result: `Subjek: ${e.subject}\nDari: ${e.from}\nTanggal: ${e.date}\n\n${e.bodyText || e.snippet}`,
      };
    }

    case "draft_email_reply": {
      const found = await findOneEmail(supabase, userId, String(input.query ?? ""));
      if (found.error) return { ok: false, result: found.error };
      const e = found.email!;
      const body = String(input.body ?? "").trim();
      if (!body) return { ok: false, result: "Isi balesan kosong." };
      try {
        await createDraftReply(found.accessToken!, {
          threadId: e.threadId,
          to: e.from,
          subject: e.subject,
          bodyText: body,
          inReplyTo: e.messageIdHeader,
        });
        return {
          ok: true,
          result: `Draft balesan buat "${e.subject}" udah dibikin di Gmail. User tinggal review & kirim sendiri dari sana.`,
        };
      } catch (err) {
        return { ok: false, result: err instanceof Error ? err.message : "Gagal bikin draft." };
      }
    }

    default:
      return { ok: false, result: `Tool tidak dikenal: ${name}` };
  }
}
