import { describe, expect, it } from "vitest";
import { searchAll } from "./search";

// Same thenable + fluent query-builder stub used by the cron route tests --
// every chain method returns itself, and awaiting it resolves to the
// configured result, matching however many .eq()/.textSearch()/.order()
// calls searchAll chains per table.
function chainable(result: { data: unknown; error?: unknown }) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    textSearch: () => obj,
    order: () => obj,
    limit: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

function mockSupabase(tables: Record<string, { data: unknown; error?: unknown }>) {
  return {
    from: (table: string) => chainable(tables[table] ?? { data: [], error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("searchAll", () => {
  it("returns an empty array for a blank query, without hitting Supabase", async () => {
    const supabase = mockSupabase({});
    expect(await searchAll(supabase, "user-1", "   ")).toEqual([]);
  });

  it("formats and merges results from every source, newest first", async () => {
    const supabase = mockSupabase({
      transactions: {
        data: [
          {
            id: "tx-1",
            category: "Makan",
            description: "Nasi goreng",
            amount: 25000,
            occurred_on: "2026-08-01",
          },
        ],
      },
      tasks: {
        data: [
          { id: "task-1", title: "Bayar listrik", status: "todo", deadline: "2026-08-05", created_at: "2026-07-20T00:00:00Z" },
        ],
      },
      study_notes: {
        data: [{ id: "note-1", title: "Kalkulus", category: "Kuliah", progress: 40, updated_at: "2026-07-15T00:00:00Z" }],
      },
      journal_entries: {
        data: [{ id: "jrnl-1", content: "Hari ini produktif banget.", entry_date: "2026-08-02" }],
      },
      assistant_memories: {
        data: [{ id: "mem-1", content: "User suka kopi item.", created_at: "2026-07-01T00:00:00Z" }],
      },
    });

    const results = await searchAll(supabase, "user-1", "nasi");

    expect(results).toHaveLength(5);
    expect(results.map((r) => r.source)).toEqual([
      "journal",
      "transaction",
      "task",
      "note",
      "memory",
    ]);
    expect(results.find((r) => r.source === "transaction")).toMatchObject({
      id: "tx-1",
      title: "Makan — Nasi goreng",
      href: "/dashboard/keuangan",
    });
    expect(results.find((r) => r.source === "task")).toMatchObject({
      title: "Bayar listrik",
      snippet: expect.stringContaining("todo"),
      href: "/dashboard/kerjaan",
    });
  });

  it("truncates long journal/memory snippets to 120 chars", async () => {
    const longContent = "x".repeat(200);
    const supabase = mockSupabase({
      journal_entries: {
        data: [{ id: "jrnl-1", content: longContent, entry_date: "2026-08-02" }],
      },
    });

    const results = await searchAll(supabase, "user-1", "x");
    expect(results[0].snippet).toHaveLength(123); // 120 chars + "..."
    expect(results[0].snippet.endsWith("...")).toBe(true);
  });

  it("omits the em-dash suffix on a transaction with no description", async () => {
    const supabase = mockSupabase({
      transactions: {
        data: [{ id: "tx-1", category: "Gaji", description: null, amount: 5000000, occurred_on: "2026-08-01" }],
      },
    });

    const results = await searchAll(supabase, "user-1", "gaji");
    expect(results[0].title).toBe("Gaji");
  });
});
