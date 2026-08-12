// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCurrency } from "@/lib/format";

function chainable(data: unknown[] = []) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    neq: () => obj,
    gte: () => obj,
    order: () => obj,
    limit: () => obj,
    maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
  return obj;
}

type TableData = {
  tasks?: unknown[];
  study_notes?: unknown[];
  journal_entries?: unknown[];
  transactions?: unknown[];
  google_credentials?: unknown[];
  debts?: unknown[];
  debt_payments?: unknown[];
};

function fakeSupabase(tables: TableData) {
  return {
    from: (table: string) => chainable((tables as Record<string, unknown[] | undefined>)[table] ?? []),
  } as never;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("buildRealtimeExtraContext", () => {
  it("formats tasks, notes, journal entries, and transactions", async () => {
    const { buildRealtimeExtraContext } = await import("./context");
    const supabase = fakeSupabase({
      tasks: [{ title: "Bayar listrik", status: "todo", priority: "high", deadline: "2026-08-10", project: "Rumah" }],
      study_notes: [{ title: "Kalkulus", category: "Matematika", progress: 40, content: "Turunan dan integral dasar." }],
      journal_entries: [{ entry_date: "2026-08-04", content: "Hari ini produktif banget." }],
      transactions: [
        { type: "expense", category: "Makan", amount: 50000, description: "Nasi goreng", occurred_on: "2026-08-04" },
      ],
    });

    const result = await buildRealtimeExtraContext(supabase, "user-1");

    expect(result).toContain("Bayar listrik");
    expect(result).toContain("Rumah");
    expect(result).toContain("Kalkulus");
    expect(result).toContain("Turunan dan integral dasar.");
    expect(result).toContain("Hari ini produktif banget.");
    expect(result).toContain("Nasi goreng");
    expect(result).toContain("(Google Calendar belum terhubung)");
  });

  it("truncates long note content and journal entries instead of dumping them in full", async () => {
    const { buildRealtimeExtraContext } = await import("./context");
    const longContent = "x".repeat(500);
    const supabase = fakeSupabase({
      study_notes: [{ title: "Catatan panjang", category: "Umum", progress: 10, content: longContent }],
      journal_entries: [{ entry_date: "2026-08-04", content: longContent }],
    });

    const result = await buildRealtimeExtraContext(supabase, "user-1");

    expect(result).toContain("...");
    expect(result).not.toContain(longContent);
  });

  it("falls back to placeholder text for each empty section", async () => {
    const { buildRealtimeExtraContext } = await import("./context");
    const supabase = fakeSupabase({});

    const result = await buildRealtimeExtraContext(supabase, "user-1");

    expect(result).toContain("(nggak ada to-do aktif)");
    expect(result).toContain("(belum ada catatan belajar)");
    expect(result).toContain("(belum ada entri jurnal)");
    expect(result).toContain("(nggak ada transaksi dalam 3 bulan terakhir)");
    expect(result).toContain("(Google Calendar belum terhubung)");
  });

  it("lists upcoming Calendar events when connected", async () => {
    vi.doMock("@/lib/google/credentials", () => ({
      getCalendarAccessToken: vi.fn().mockResolvedValue({ accessToken: "token-abc" }),
    }));
    vi.doMock("@/lib/google/calendar", () => ({
      listUpcomingEvents: vi.fn().mockResolvedValue([
        { id: "1", summary: "Meeting tim", start: "2026-08-06T10:00:00Z", end: "2026-08-06T11:00:00Z", location: "Zoom" },
      ]),
    }));
    const { buildRealtimeExtraContext } = await import("./context");
    const supabase = fakeSupabase({});

    const result = await buildRealtimeExtraContext(supabase, "user-1");

    expect(result).toContain("Meeting tim");
    expect(result).toContain("Zoom");
  });

  it("shows a fallback message when the Calendar fetch fails", async () => {
    vi.doMock("@/lib/google/credentials", () => ({
      getCalendarAccessToken: vi.fn().mockResolvedValue({ accessToken: "token-abc" }),
    }));
    vi.doMock("@/lib/google/calendar", () => ({
      listUpcomingEvents: vi.fn().mockRejectedValue(new Error("Google API error")),
    }));
    const { buildRealtimeExtraContext } = await import("./context");
    const supabase = fakeSupabase({});

    const result = await buildRealtimeExtraContext(supabase, "user-1");

    expect(result).toContain("(gagal ambil jadwal Calendar)");
  });
});

describe("buildAssistantSystemPrompt", () => {
  it("reports a debt's remaining balance after partial payments, not the original amount", async () => {
    const { buildAssistantSystemPrompt } = await import("./context");
    const supabase = fakeSupabase({
      debts: [
        { id: "d1", party_name: "Bank", direction: "i_owe", amount: 1000, due_date: null, status: "unpaid" },
      ],
      debt_payments: [{ debt_id: "d1", amount: 400 }],
    });

    const result = await buildAssistantSystemPrompt(supabase, "user-1");

    expect(result).toContain(`Saya utang ke Bank: ${formatCurrency(600)}`);
    expect(result).not.toContain(formatCurrency(1000));
  });

  it("shows zero owed when there are no unpaid debts", async () => {
    const { buildAssistantSystemPrompt } = await import("./context");
    const supabase = fakeSupabase({});

    const result = await buildAssistantSystemPrompt(supabase, "user-1");

    expect(result).toContain("(nggak ada utang/piutang aktif)");
  });
});
