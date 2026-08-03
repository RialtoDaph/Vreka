// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const TIMER_STORAGE_KEY = "vreka-pelajaran-timer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
  window.localStorage.clear();
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

describe("PelajaranPage (persist timer)", () => {
  const note = {
    id: "note-1",
    title: "Kalkulus",
    category: "Kuliah",
    content: "Turunan & integral",
    progress: 40,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };

  it("starting a timer saves it to localStorage", async () => {
    mockSupabase([note]);
    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    fireEvent.click(await screen.findByText(/⏱ Mulai Sesi/));

    const saved = JSON.parse(window.localStorage.getItem(TIMER_STORAGE_KEY)!);
    expect(saved.noteId).toBe("note-1");
    expect(typeof saved.startedAt).toBe("number");
  });

  it("stopping a timer clears it from localStorage", async () => {
    mockSupabase([note]);
    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    fireEvent.click(await screen.findByText(/⏱ Mulai Sesi/));
    expect(window.localStorage.getItem(TIMER_STORAGE_KEY)).not.toBeNull();

    fireEvent.click(await screen.findByText(/Stop/));
    expect(window.localStorage.getItem(TIMER_STORAGE_KEY)).toBeNull();
  });

  it("restores a timer still running from before a refresh", async () => {
    window.localStorage.setItem(
      TIMER_STORAGE_KEY,
      JSON.stringify({ noteId: "note-1", startedAt: Date.now() - 65_000 })
    );
    mockSupabase([note]);
    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    // ~65s elapsed restores as 1:0x, and the button now reads "... Stop"
    // instead of the fresh "Mulai Sesi" state.
    expect(await screen.findByText(/1:0\d — Stop/)).toBeInTheDocument();
  });

  it("discards a restored timer whose note no longer exists", async () => {
    window.localStorage.setItem(
      TIMER_STORAGE_KEY,
      JSON.stringify({ noteId: "deleted-note", startedAt: Date.now() - 5_000 })
    );
    mockSupabase([note]);
    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    const startButton = await screen.findByText(/⏱ Mulai Sesi/);
    // The stale-timer check only runs once the notes list has loaded (it
    // needs `items` to know the note is gone), so the button is briefly
    // disabled from the restored timer before that cleanup effect fires.
    await waitFor(() => expect(startButton).not.toBeDisabled());
    expect(window.localStorage.getItem(TIMER_STORAGE_KEY)).toBeNull();
  });
});
