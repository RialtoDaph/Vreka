import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("executeAssistantTool: search_records", () => {
  it("rejects an empty query", async () => {
    vi.doMock("@/lib/search", () => ({ searchAll: vi.fn() }));
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "search_records", { query: "" });
    expect(res).toEqual({ ok: false, result: "query kosong." });
  });

  it("reports when nothing matches", async () => {
    vi.doMock("@/lib/search", () => ({ searchAll: vi.fn().mockResolvedValue([]) }));
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "search_records", { query: "zzz" });
    expect(res).toEqual({ ok: true, result: 'Nggak nemu apa-apa buat "zzz".' });
  });

  it("formats matches with a source label per line", async () => {
    const searchAll = vi.fn().mockResolvedValue([
      { source: "task", id: "t1", title: "Bayar listrik", snippet: "todo", date: "2026-08-01", href: "/dashboard/kerjaan" },
      {
        source: "transaction",
        id: "tx1",
        title: "Makan — Nasi goreng",
        snippet: "25,00 € · 1 Agu 2026",
        date: "2026-08-01",
        href: "/dashboard/keuangan",
      },
    ]);
    vi.doMock("@/lib/search", () => ({ searchAll }));
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "search_records", { query: "listrik" });

    expect(searchAll).toHaveBeenCalledWith({}, "user-1", "listrik", 5);
    expect(res.ok).toBe(true);
    expect(res.result).toBe(
      "- [To-do] Bayar listrik — todo\n- [Transaksi] Makan — Nasi goreng — 25,00 € · 1 Agu 2026"
    );
  });
});
