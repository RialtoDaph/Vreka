// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function mockSupabase(entries: unknown[]) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: () => ({
        select: () => ({ order: () => Promise.resolve({ data: entries, error: null }) }),
      }),
    }),
  }));
}

describe("JurnalPage", () => {
  it("pre-fills today's textarea when an entry already exists for today", async () => {
    mockSupabase([
      {
        id: "e1",
        entry_date: todayStr(),
        content: "Hari ini produktif banget.",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ]);
    const { default: JurnalPage } = await import("./page");
    render(<JurnalPage />);

    const textarea = (await screen.findByPlaceholderText("Tulis apa aja...")) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Hari ini produktif banget.");
    expect(screen.getByText("Update Catatan Hari Ini")).toBeInTheDocument();
  });

  it("shows past entries but excludes today's from the history list", async () => {
    mockSupabase([
      {
        id: "e1",
        entry_date: todayStr(),
        content: "Punya Hari ini",
        created_at: "2026-01-02",
        updated_at: "2026-01-02",
      },
      {
        id: "e2",
        entry_date: "2026-01-01",
        content: "Catatan kemarin lusa",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ]);
    const { default: JurnalPage } = await import("./page");
    render(<JurnalPage />);

    expect(await screen.findByText("Catatan kemarin lusa")).toBeInTheDocument();
    // Today's content shows up once — pre-filled in the textarea — but not
    // as a second entry in the history list below it.
    expect(screen.getAllByText("Punya Hari ini")).toHaveLength(1);
  });

  it("disables save when there is no content yet", async () => {
    mockSupabase([]);
    const { default: JurnalPage } = await import("./page");
    render(<JurnalPage />);

    const button = await screen.findByText("Simpan Catatan Hari Ini");
    expect(button).toBeDisabled();
  });
});
