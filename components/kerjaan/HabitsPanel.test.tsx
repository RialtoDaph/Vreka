// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

type Row = Record<string, unknown>;

function mockSupabase(habitRows: Row[], checkRows: Row[]) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: (table: string) => {
        if (table === "habits") {
          return {
            select: () => ({ order: () => Promise.resolve({ data: habitRows, error: null }) }),
            update: (payload: Row) => ({
              eq: (_col: string, value: unknown) => {
                const row = habitRows.find((r) => r.id === value);
                if (row) Object.assign(row, payload);
                return Promise.resolve({ error: null });
              },
            }),
            delete: () => ({
              eq: (_col: string, value: unknown) => {
                const idx = habitRows.findIndex((r) => r.id === value);
                if (idx >= 0) habitRows.splice(idx, 1);
                return Promise.resolve({ error: null });
              },
            }),
          };
        }
        if (table === "habit_checks") {
          return { select: () => Promise.resolve({ data: checkRows, error: null }) };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("HabitsPanel", () => {
  it("shows an empty state when there are no habits", async () => {
    mockSupabase([], []);
    const { default: HabitsPanel } = await import("./HabitsPanel");
    render(<HabitsPanel />);

    expect(await screen.findByText("Belum ada kebiasaan yang dilacak.")).toBeInTheDocument();
  });

  it("renames a habit inline", async () => {
    mockSupabase([{ id: "h1", title: "Olahraga", user_id: "u1", created_at: "2026-01-01" }], []);
    const { default: HabitsPanel } = await import("./HabitsPanel");
    render(<HabitsPanel />);

    const titleButton = await screen.findByText("Olahraga");
    fireEvent.click(titleButton);

    const input = screen.getByDisplayValue("Olahraga");
    fireEvent.change(input, { target: { value: "Lari pagi" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(screen.getByText("Lari pagi")).toBeInTheDocument());
    expect(screen.queryByText("Olahraga")).not.toBeInTheDocument();
  });

  it("deletes a habit after confirming", async () => {
    mockSupabase([{ id: "h1", title: "Baca buku", user_id: "u1", created_at: "2026-01-01" }], []);
    const { default: HabitsPanel } = await import("./HabitsPanel");
    render(<HabitsPanel />);

    await screen.findByText("Baca buku");
    fireEvent.click(screen.getByText("Hapus"));
    fireEvent.click(await screen.findByText("Ya, lanjut"));

    await waitFor(() => expect(screen.queryByText("Baca buku")).not.toBeInTheDocument());
  });
});
