// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

function mockSupabase({
  memCount,
  callCount,
  lastLog,
}: {
  memCount: number;
  callCount: number;
  lastLog: { created_at: string } | null;
}) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: (table: string) => {
        if (table === "assistant_memories") {
          return { select: () => Promise.resolve({ count: memCount, data: null, error: null }) };
        }
        if (table === "assistant_audit_log") {
          return {
            select: (_cols: string, opts?: { count?: string }) => {
              if (opts?.count) {
                return { gte: () => Promise.resolve({ count: callCount, error: null }) };
              }
              return {
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve({ data: lastLog, error: null }),
                  }),
                }),
              };
            },
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

describe("StatusAslan", () => {
  it("counts the model as always-connected plus every real connected integration", async () => {
    mockSupabase({ memCount: 16, callCount: 3, lastLog: { created_at: "2026-08-03T09:00:00Z" } });
    const { default: StatusAslan } = await import("./StatusAslan");
    render(
      <StatusAslan gmailConnected telegramConnected voiceSupported onManage={() => {}} />
    );

    expect(await screen.findByText(/4\/4 sistem terhubung/)).toBeInTheDocument();
    expect(screen.getByText(/16 memori/)).toBeInTheDocument();
    expect(screen.getByText(/3 aksi hari ini/)).toBeInTheDocument();
    expect(screen.getByText(/terakhir aktif/)).toBeInTheDocument();
  });

  it("only counts the model itself when nothing else is connected", async () => {
    mockSupabase({ memCount: 0, callCount: 0, lastLog: null });
    const { default: StatusAslan } = await import("./StatusAslan");
    render(
      <StatusAslan
        gmailConnected={false}
        telegramConnected={false}
        voiceSupported={false}
        onManage={() => {}}
      />
    );

    expect(await screen.findByText(/1\/4 sistem terhubung/)).toBeInTheDocument();
    expect(screen.queryByText(/terakhir aktif/)).not.toBeInTheDocument();
  });

  it("calls onManage when clicked", async () => {
    mockSupabase({ memCount: 0, callCount: 0, lastLog: null });
    const onManage = vi.fn();
    const { default: StatusAslan } = await import("./StatusAslan");
    render(
      <StatusAslan
        gmailConnected={false}
        telegramConnected={false}
        voiceSupported={false}
        onManage={onManage}
      />
    );

    fireEvent.click(await screen.findByText(/Kelola/));
    expect(onManage).toHaveBeenCalledTimes(1);
  });
});
