// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

function mockSupabase(notes: unknown[]) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: (table: string) => {
        if (table === "study_notes") {
          return { select: () => ({ order: () => Promise.resolve({ data: notes, error: null }) }) };
        }
        if (table === "study_sessions") {
          return { select: () => Promise.resolve({ data: [], error: null }) };
        }
        if (table === "study_resources") {
          return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

describe("PelajaranPage (mode kuis)", () => {
  it("scores a quiz and offers to raise progress when the score beats the current one", async () => {
    mockSupabase([
      {
        id: "note-1",
        title: "Bahasa Jerman A2",
        category: "Bahasa",
        content: "Der/die/das...",
        progress: 20,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          questions: [
            { question: "Artikel netral?", options: ["der", "die", "das"], correct_index: 2 },
          ],
        }),
      })
    );

    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    fireEvent.click(await screen.findByText("🧠 Mode Kuis"));
    expect(await screen.findByText(/Artikel netral\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("das"));
    fireEvent.click(screen.getByText("Selesai"));

    expect(await screen.findByText("Skor: 100%")).toBeInTheDocument();
    expect(screen.getByText("Update progress ke 100%")).toBeInTheDocument();
  });

  it("doesn't offer to lower progress when the quiz score is below the current one", async () => {
    mockSupabase([
      {
        id: "note-1",
        title: "Bahasa Jerman A2",
        category: "Bahasa",
        content: "Der/die/das...",
        progress: 90,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          questions: [
            { question: "Artikel netral?", options: ["der", "die", "das"], correct_index: 2 },
          ],
        }),
      })
    );

    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    fireEvent.click(await screen.findByText("🧠 Mode Kuis"));
    expect(await screen.findByText(/Artikel netral\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("der")); // wrong answer -> 0%
    fireEvent.click(screen.getByText("Selesai"));

    expect(await screen.findByText("Skor: 0%")).toBeInTheDocument();
    expect(screen.queryByText(/Update progress ke/)).not.toBeInTheDocument();
  });

  it("surfaces the API error when the note has no content to quiz on", async () => {
    mockSupabase([
      {
        id: "note-1",
        title: "Kosong",
        category: "Umum",
        content: "isi dikit",
        progress: 0,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Catatan ini belum ada isinya, nggak bisa dibikin kuis." }),
      })
    );

    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    fireEvent.click(await screen.findByText("🧠 Mode Kuis"));
    expect(
      await screen.findByText("Catatan ini belum ada isinya, nggak bisa dibikin kuis.")
    ).toBeInTheDocument();
  });
});
