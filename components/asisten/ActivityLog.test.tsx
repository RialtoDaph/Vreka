// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

type Rows = {
  auditRows?: { id: string; tool_name: string; input: Record<string, unknown>; result_ok: boolean; created_at: string }[];
  memories?: { id: string; content: string; created_at: string }[];
  totalMessages?: number;
  oldestMessageAt?: string | null;
};

function mockSupabase({ auditRows = [], memories = [], totalMessages = 0, oldestMessageAt = null }: Rows) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: (table: string) => {
        if (table === "assistant_audit_log") {
          return {
            select: (cols: string) => {
              if (cols === "*") {
                return { order: () => ({ limit: () => Promise.resolve({ data: auditRows, error: null }) }) };
              }
              return { gte: () => Promise.resolve({ data: auditRows, error: null }) };
            },
          };
        }
        if (table === "assistant_messages") {
          return {
            select: (_cols: string, opts?: { count?: string }) => {
              if (opts?.count) return Promise.resolve({ count: totalMessages, error: null });
              return {
                order: () => ({
                  limit: () => ({
                    maybeSingle: () =>
                      Promise.resolve({ data: oldestMessageAt ? { created_at: oldestMessageAt } : null, error: null }),
                  }),
                }),
              };
            },
          };
        }
        if (table === "assistant_memories") {
          return {
            select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: memories, error: null }) }) }),
            delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

async function openPanel() {
  fireEvent.click(screen.getByText(/Aktivitas Aslan/));
}

describe("ActivityLog", () => {
  it("shows chat stats and a tool usage breakdown", async () => {
    mockSupabase({
      totalMessages: 42,
      oldestMessageAt: "2026-01-05T00:00:00Z",
      auditRows: [
        { id: "1", tool_name: "add_transaction", input: {}, result_ok: true, created_at: "2026-08-01T00:00:00Z" },
        { id: "2", tool_name: "add_transaction", input: {}, result_ok: true, created_at: "2026-08-02T00:00:00Z" },
        { id: "3", tool_name: "remember", input: {}, result_ok: true, created_at: "2026-08-02T00:00:00Z" },
      ],
    });
    const { default: ActivityLog } = await import("./ActivityLog");
    render(<ActivityLog />);
    await openPanel();

    expect(await screen.findByText(/42 obrolan/)).toBeInTheDocument();
    expect(screen.getByText(/udah ngobrol sejak/)).toBeInTheDocument();
    expect(screen.getAllByText("Nyatetin transaksi").length).toBeGreaterThan(0);
    expect(screen.getByText("2x")).toBeInTheDocument();
  });

  it("lists real memories and deletes one", async () => {
    mockSupabase({
      memories: [
        { id: "m1", content: "Suka kopi item", created_at: "2026-07-01T00:00:00Z" },
        { id: "m2", content: "Kerja remote dari Berlin", created_at: "2026-07-02T00:00:00Z" },
      ],
    });
    const { default: ActivityLog } = await import("./ActivityLog");
    render(<ActivityLog />);
    await openPanel();

    expect(await screen.findByText("Suka kopi item")).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("Hapus")[0]);

    await waitFor(() => expect(screen.queryByText("Suka kopi item")).not.toBeInTheDocument());
    expect(screen.getByText("Kerja remote dari Berlin")).toBeInTheDocument();
  });

  it("shows empty-state messages when there's nothing recorded", async () => {
    mockSupabase({});
    const { default: ActivityLog } = await import("./ActivityLog");
    render(<ActivityLog />);
    await openPanel();

    expect(await screen.findByText("Belum ada memori tersimpan.")).toBeInTheDocument();
    expect(screen.getByText("Belum ada aktivitas tercatat.")).toBeInTheDocument();
  });
});
