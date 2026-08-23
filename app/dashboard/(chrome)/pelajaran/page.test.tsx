// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const TIMER_STORAGE_KEY = "vreka-pelajaran-timer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

function chain(data: unknown[]) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    order: () => obj,
    eq: () => obj,
    single: () => Promise.resolve({ data: data[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
  return obj;
}

function mockSupabase(
  notes: unknown[],
  onUpdate?: (patch: Record<string, unknown>) => void,
  {
    sessionRows = [] as unknown[],
    flashcardRows = [] as unknown[],
    onFlashcardInsert,
    onFlashcardUpdate,
  }: {
    sessionRows?: unknown[];
    flashcardRows?: unknown[];
    onFlashcardInsert?: (payload: unknown) => void;
    onFlashcardUpdate?: (patch: Record<string, unknown>) => void;
  } = {}
) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      from: (table: string) => {
        if (table === "study_notes") {
          return {
            select: () => ({ order: () => Promise.resolve({ data: notes, error: null }) }),
            update: (patch: Record<string, unknown>) => ({
              eq: () => {
                onUpdate?.(patch);
                return Promise.resolve({ error: null });
              },
            }),
          };
        }
        if (table === "study_sessions") {
          return { select: () => Promise.resolve({ data: sessionRows, error: null }) };
        }
        if (table === "study_resources") {
          return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
        }
        if (table === "flashcards") {
          return {
            select: () => chain(flashcardRows),
            insert: (payload: unknown) => {
              onFlashcardInsert?.(payload);
              const inserted = Array.isArray(payload) ? payload : [payload];
              const withIds = inserted.map((p, i) => ({
                id: `new-card-${i}`,
                ease_factor: 2.5,
                interval_days: 0,
                repetitions: 0,
                due_at: new Date().toISOString(),
                last_reviewed_at: null,
                created_at: new Date().toISOString(),
                ...(p as Record<string, unknown>),
              }));
              return chain(withIds);
            },
            update: (patch: Record<string, unknown>) => ({
              eq: () => {
                onFlashcardUpdate?.(patch);
                return Promise.resolve({ error: null });
              },
            }),
            delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
          };
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

    fireEvent.click(await screen.findByText("Mode Kuis"));
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

    fireEvent.click(await screen.findByText("Mode Kuis"));
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

    fireEvent.click(await screen.findByText("Mode Kuis"));
    expect(
      await screen.findByText("Catatan ini belum ada isinya, nggak bisa dibikin kuis.")
    ).toBeInTheDocument();
  });
});

describe("PelajaranPage (edit note)", () => {
  it("edits a note's title, category, and content", async () => {
    const updates: Record<string, unknown>[] = [];
    mockSupabase(
      [
        {
          id: "note-1",
          title: "Bahasa Jerman A2",
          category: "Bahasa",
          content: "Der/die/das...",
          progress: 20,
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        },
      ],
      (patch) => updates.push(patch)
    );

    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    fireEvent.click(await screen.findByText("Edit"));

    const titleInput = screen.getByPlaceholderText("Judul topik") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Bahasa Jerman B1" } });
    fireEvent.change(screen.getByPlaceholderText("Kategori"), { target: { value: "Bahasa Asing" } });
    fireEvent.change(screen.getByPlaceholderText("Catatan"), { target: { value: "Konjunktiv II" } });
    fireEvent.click(screen.getByText("Simpan"));

    expect(await screen.findByText("Bahasa Jerman B1")).toBeInTheDocument();
    expect(screen.getByText("Bahasa Asing")).toBeInTheDocument();
    expect(updates[0]).toMatchObject({
      title: "Bahasa Jerman B1",
      category: "Bahasa Asing",
      content: "Konjunktiv II",
    });
  });

  it("cancels an edit without saving changes", async () => {
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

    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    fireEvent.click(await screen.findByText("Edit"));
    fireEvent.change(screen.getByPlaceholderText("Judul topik"), { target: { value: "Ganti dulu" } });
    fireEvent.click(screen.getByText("Batal"));

    expect(screen.getByText("Bahasa Jerman A2")).toBeInTheDocument();
    expect(screen.queryByText("Ganti dulu")).not.toBeInTheDocument();
  });
});

describe("PelajaranPage (pomodoro)", () => {
  it("counts down while running and switches to break after a work session completes", async () => {
    vi.useFakeTimers();
    mockSupabase([]);
    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    expect(screen.getByText("25:00")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Mulai"));
    expect(screen.getByText("Jeda")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("24:55")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(25 * 60 * 1000);
    });
    expect(screen.getByText(/Waktunya istirahat/)).toBeInTheDocument();
    expect(screen.getByText(/1 sesi selesai/)).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("Mulai")).toBeInTheDocument();
  });

  it("resets back to a fresh work session", async () => {
    vi.useFakeTimers();
    mockSupabase([]);
    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    fireEvent.click(screen.getByText("Mulai"));
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("24:50")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Reset"));
    expect(screen.getByText("25:00")).toBeInTheDocument();
    expect(screen.getByText("Mulai")).toBeInTheDocument();
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

describe("PelajaranPage (flashcards)", () => {
  const note = {
    id: "note-1",
    title: "Bahasa Inggris B1",
    category: "Bahasa",
    content: "though = walaupun, meskipun",
    progress: 10,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };

  it("adds a flashcard manually and shows it in the card list", async () => {
    mockSupabase([note]);
    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    fireEvent.click(await screen.findByText(/Kartu/));
    fireEvent.change(screen.getByPlaceholderText("Depan (kata/istilah)"), { target: { value: "though" } });
    fireEvent.change(screen.getByPlaceholderText("Belakang (jawaban)"), { target: { value: "walaupun" } });
    fireEvent.click(screen.getByText("+"));

    expect(await screen.findByText("though")).toBeInTheDocument();
  });

  it("reviews a due flashcard end-to-end: flip, rate, and finish the session", async () => {
    mockSupabase([note], undefined, {
      flashcardRows: [
        {
          id: "card-1",
          note_id: "note-1",
          front: "though",
          back: "walaupun",
          ease_factor: 2.5,
          interval_days: 0,
          repetitions: 0,
          due_at: "2020-01-01T00:00:00Z",
          last_reviewed_at: null,
          created_at: "2020-01-01T00:00:00Z",
        },
      ],
    });
    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    fireEvent.click(await screen.findByText(/Kartu \(1 due\)/));
    fireEvent.click(await screen.findByText("Mulai Review (1)"));

    expect(await screen.findByText("though")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Balik Kartu"));
    expect(await screen.findByText("walaupun")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Oke"));
    expect(await screen.findByText(/Review selesai! 1 kartu direview/)).toBeInTheDocument();
  });

  it("deletes a flashcard", async () => {
    mockSupabase([note], undefined, {
      flashcardRows: [
        {
          id: "card-1",
          note_id: "note-1",
          front: "though",
          back: "walaupun",
          ease_factor: 2.5,
          interval_days: 0,
          repetitions: 0,
          due_at: "2099-01-01T00:00:00Z",
          last_reviewed_at: null,
          created_at: "2020-01-01T00:00:00Z",
        },
      ],
    });
    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    fireEvent.click(await screen.findByText(/Kartu/));
    expect(await screen.findByText("though")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Hapus kartu though"));

    await waitFor(() => expect(screen.queryByText("though")).not.toBeInTheDocument());
  });

  it("generates flashcard candidates from the note content and saves the selected ones", async () => {
    mockSupabase([note]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ cards: [{ front: "though", back: "walaupun" }] }),
      })
    );

    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    fireEvent.click(await screen.findByText(/Kartu/));
    fireEvent.click(screen.getByText("Generate dari Catatan"));

    expect(await screen.findByText("though")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Simpan Terpilih"));

    await waitFor(() =>
      expect(screen.queryByText("Kartu hasil generate -- pilih yang mau disimpan")).not.toBeInTheDocument()
    );
  });
});

describe("PelajaranPage (streak)", () => {
  it("shows the current streak based on recent study sessions", async () => {
    const today = new Date().toISOString();
    mockSupabase([], undefined, { sessionRows: [{ note_id: "note-1", minutes: 20, created_at: today }] });
    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    expect(await screen.findByText(/1 hari beruntun belajar/)).toBeInTheDocument();
  });

  it("doesn't show a streak badge when there's no recent activity", async () => {
    mockSupabase([]);
    const { default: PelajaranPage } = await import("./page");
    render(<PelajaranPage />);

    await screen.findByText("Belum ada topik belajar.");
    expect(screen.queryByText(/hari beruntun belajar/)).not.toBeInTheDocument();
  });
});
