// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

// getUserSequence lets a test say "unauthenticated on the first call, then
// authenticated" to simulate a stale access token that only recovers after
// an explicit refreshSession() call.
function mockSupabaseForSave(opts: {
  entries?: unknown[];
  getUserSequence: Array<{ id: string } | null>;
  upsertResult?: { data: unknown; error: unknown };
}) {
  const { entries = [], getUserSequence, upsertResult } = opts;
  let getUserCall = 0;
  const refreshSession = vi.fn().mockResolvedValue({ data: {}, error: null });
  const getUser = vi.fn().mockImplementation(() => {
    const user = getUserSequence[Math.min(getUserCall, getUserSequence.length - 1)];
    getUserCall += 1;
    return Promise.resolve({ data: { user } });
  });
  const upsert = vi.fn().mockReturnValue({
    select: () => ({
      single: () =>
        Promise.resolve(
          upsertResult ?? {
            data: { id: "new1", entry_date: todayStr(), content: "Catatan baru", created_at: "t", updated_at: "t" },
            error: null,
          }
        ),
    }),
  });
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: { getUser, refreshSession },
      from: () => ({
        select: () => ({ order: () => Promise.resolve({ data: entries, error: null }) }),
        upsert,
      }),
    }),
  }));
  return { getUser, refreshSession, upsert };
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
    expect(screen.getByText("Update Catatan")).toBeInTheDocument();
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

    const button = await screen.findByText("Simpan Catatan");
    expect(button).toBeDisabled();
  });

  it("shows a streak badge when today and yesterday both have entries", async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    mockSupabase([
      { id: "e1", entry_date: today.toISOString().slice(0, 10), content: "Hari ini", created_at: "t", updated_at: "t" },
      {
        id: "e2",
        entry_date: yesterday.toISOString().slice(0, 10),
        content: "Kemarin",
        created_at: "t",
        updated_at: "t",
      },
    ]);
    const { default: JurnalPage } = await import("./page");
    render(<JurnalPage />);

    expect(await screen.findByText("2 hari beruntun")).toBeInTheDocument();
  });

  it("hides the streak badge when there is no current streak", async () => {
    mockSupabase([]);
    const { default: JurnalPage } = await import("./page");
    render(<JurnalPage />);

    await screen.findByText("Simpan Catatan");
    expect(screen.queryByText(/hari beruntun/)).not.toBeInTheDocument();
  });

  it("saves normally when the session is already valid", async () => {
    const { upsert, refreshSession } = mockSupabaseForSave({ getUserSequence: [{ id: "u1" }] });
    const { default: JurnalPage } = await import("./page");
    render(<JurnalPage />);

    fireEvent.change(await screen.findByPlaceholderText("Tulis apa aja..."), {
      target: { value: "Catatan baru" },
    });
    fireEvent.click(screen.getByText("Simpan Catatan"));

    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("retries with a session refresh when the access token looks stale, and still saves", async () => {
    // First getUser() call comes back empty (stale token after the tab was
    // backgrounded), second one (after refreshSession) succeeds.
    const { upsert, refreshSession } = mockSupabaseForSave({
      getUserSequence: [null, { id: "u1" }],
    });
    const { default: JurnalPage } = await import("./page");
    render(<JurnalPage />);

    fireEvent.change(await screen.findByPlaceholderText("Tulis apa aja..."), {
      target: { value: "Catatan baru" },
    });
    fireEvent.click(screen.getByText("Simpan Catatan"));

    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(refreshSession).toHaveBeenCalled();
    expect(screen.queryByText(/Sesi login habis/)).not.toBeInTheDocument();
  });

  it("shows a login-again message (without wiping the draft) when the session is truly gone", async () => {
    mockSupabaseForSave({ getUserSequence: [null, null] });
    const { default: JurnalPage } = await import("./page");
    render(<JurnalPage />);

    const textarea = (await screen.findByPlaceholderText("Tulis apa aja...")) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Catatan penting" } });
    fireEvent.click(screen.getByText("Simpan Catatan"));

    expect(await screen.findByText(/Sesi login habis/)).toBeInTheDocument();
    // The draft stays in the textarea -- the user shouldn't be told to
    // reload the page, since that would actually lose this content.
    expect(textarea.value).toBe("Catatan penting");
  });
});
