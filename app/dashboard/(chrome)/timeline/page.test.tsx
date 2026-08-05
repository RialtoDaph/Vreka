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
  milestones?: unknown[];
  studyNotes?: unknown[];
  habits?: unknown[];
  habitChecks?: unknown[];
  userCreatedAt?: string;
};

// Chainable Supabase table double. Reads are plain thenables; the
// milestones table also supports insert().select().single(),
// update().eq().select().single(), and delete().eq() for the
// add/edit/remove flows.
function chainableTable(rows: unknown[]) {
  let newId = 0;
  let pendingInsert: Record<string, unknown> | null = null;
  let pendingUpdate: Record<string, unknown> | null = null;
  let pendingEqId: unknown = null;
  const obj: Record<string, unknown> = {
    select: () => obj,
    order: () => obj,
    eq: (_col: string, value: unknown) => {
      pendingEqId = value;
      return obj;
    },
    delete: () => obj,
    insert: (payload: Record<string, unknown>) => {
      pendingInsert = payload;
      return obj;
    },
    update: (payload: Record<string, unknown>) => {
      pendingUpdate = payload;
      return obj;
    },
    single: () =>
      Promise.resolve({
        data: pendingInsert
          ? { id: `new-${++newId}`, created_at: "now", ...pendingInsert }
          : pendingUpdate
            ? { id: pendingEqId, created_at: "now", ...pendingUpdate }
            : null,
        error: null,
      }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return obj;
}

function mockSupabase(rows: Rows) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-1", created_at: rows.userCreatedAt ?? "2026-01-15T00:00:00Z" } },
        }),
      },
      from: (table: string) => {
        if (table === "life_milestones") return chainableTable(rows.milestones ?? []);
        if (table === "study_notes") return chainableTable(rows.studyNotes ?? []);
        if (table === "habits") return chainableTable(rows.habits ?? []);
        if (table === "habit_checks") return chainableTable(rows.habitChecks ?? []);
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

describe("TimelineKehidupanPage", () => {
  it("shows an empty state when there's nothing to show", async () => {
    mockSupabase({});
    const { default: TimelineKehidupanPage } = await import("./page");
    render(<TimelineKehidupanPage />);

    expect(
      await screen.findByText('Belum ada milestone. Tambah yang pertama lewat "+ Milestone".')
    ).toBeInTheDocument();
  });

  it("splits manual milestones into before/since the Vreka start date", async () => {
    mockSupabase({
      userCreatedAt: "2026-01-15T00:00:00Z",
      milestones: [
        {
          id: "m1",
          title: "Lulus kuliah",
          occurred_on: "2023-06-01",
          category: "pendidikan",
          description: null,
        },
        {
          id: "m2",
          title: "Pindah ke Berlin",
          occurred_on: "2026-02-01",
          category: "keluarga",
          description: null,
        },
      ],
    });
    const { default: TimelineKehidupanPage } = await import("./page");
    render(<TimelineKehidupanPage />);

    expect(await screen.findByText("Lulus kuliah")).toBeInTheDocument();
    expect(screen.getByText("Pindah ke Berlin")).toBeInTheDocument();
    expect(screen.getByText(/Mulai pakai Vreka/)).toBeInTheDocument();
  });

  it("surfaces a study note finished at 100% as an automatic entry", async () => {
    mockSupabase({
      studyNotes: [{ id: "n1", title: "Kalkulus II", progress: 100, updated_at: "2026-03-01T00:00:00Z" }],
    });
    const { default: TimelineKehidupanPage } = await import("./page");
    render(<TimelineKehidupanPage />);

    expect(await screen.findByText('Topik "Kalkulus II" selesai 100%')).toBeInTheDocument();
    expect(screen.getAllByText("Otomatis").length).toBeGreaterThan(0);
  });

  it("adds a new milestone through the form", async () => {
    mockSupabase({});
    const { default: TimelineKehidupanPage } = await import("./page");
    render(<TimelineKehidupanPage />);

    await screen.findByText('Belum ada milestone. Tambah yang pertama lewat "+ Milestone".');
    fireEvent.click(screen.getByText("+ Milestone"));
    fireEvent.change(screen.getByPlaceholderText("Wisuda, kerja baru, dll"), {
      target: { value: "Wisuda S1" },
    });
    fireEvent.click(screen.getByText("Simpan"));

    await waitFor(() => expect(screen.getByText("Wisuda S1")).toBeInTheDocument());
  });

  it("deletes a manual milestone but not an automatic entry", async () => {
    mockSupabase({
      milestones: [
        { id: "m1", title: "Lulus kuliah", occurred_on: "2020-01-01", category: "pendidikan", description: null },
      ],
      studyNotes: [{ id: "n1", title: "Kalkulus II", progress: 100, updated_at: "2026-03-01T00:00:00Z" }],
    });
    const { default: TimelineKehidupanPage } = await import("./page");
    render(<TimelineKehidupanPage />);

    await screen.findByText("Lulus kuliah");
    expect(screen.queryByLabelText(/Hapus milestone Topik/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Hapus milestone Lulus kuliah"));
    await waitFor(() => expect(screen.queryByText("Lulus kuliah")).not.toBeInTheDocument());
  });

  it("edits an existing milestone", async () => {
    mockSupabase({
      milestones: [
        { id: "m1", title: "Lulus kuliah", occurred_on: "2020-01-01", ended_on: null, category: "pendidikan", description: null },
      ],
    });
    const { default: TimelineKehidupanPage } = await import("./page");
    render(<TimelineKehidupanPage />);

    await screen.findByText("Lulus kuliah");
    fireEvent.click(screen.getByLabelText("Edit milestone Lulus kuliah"));

    const titleInput = screen.getByDisplayValue("Lulus kuliah");
    fireEvent.change(titleInput, { target: { value: "Lulus S1" } });
    fireEvent.click(screen.getByText("Update Milestone"));

    await waitFor(() => expect(screen.getByText("Lulus S1")).toBeInTheDocument());
    expect(screen.queryByText("Lulus kuliah")).not.toBeInTheDocument();
  });

  it("shows a date range when a milestone has an end date", async () => {
    mockSupabase({
      milestones: [
        {
          id: "m1",
          title: "Kuliah S1",
          occurred_on: "2018-08-01",
          ended_on: "2022-06-01",
          category: "pendidikan",
          description: null,
        },
      ],
    });
    const { default: TimelineKehidupanPage } = await import("./page");
    render(<TimelineKehidupanPage />);

    expect(await screen.findByText(/2018.*–.*2022/)).toBeInTheDocument();
  });

  it("rejects an end date before the start date", async () => {
    mockSupabase({});
    const { default: TimelineKehidupanPage } = await import("./page");
    render(<TimelineKehidupanPage />);

    await screen.findByText('Belum ada milestone. Tambah yang pertama lewat "+ Milestone".');
    fireEvent.click(screen.getByText("+ Milestone"));
    fireEvent.change(screen.getByPlaceholderText("Wisuda, kerja baru, dll"), {
      target: { value: "Kuliah S1" },
    });
    fireEvent.change(screen.getByLabelText("Tanggal mulai"), { target: { value: "2022-01-01" } });
    fireEvent.change(screen.getByLabelText("Tanggal selesai (opsional)"), { target: { value: "2020-01-01" } });
    fireEvent.click(screen.getByText("Simpan"));

    expect(
      await screen.findByText("Tanggal selesai nggak boleh sebelum tanggal mulai.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Kuliah S1")).not.toBeInTheDocument();
  });

  it("filters entries by category", async () => {
    mockSupabase({
      milestones: [
        { id: "m1", title: "Lulus kuliah", occurred_on: "2020-01-01", category: "pendidikan", description: null },
        { id: "m2", title: "Kerja baru", occurred_on: "2026-02-01", category: "karier", description: null },
      ],
    });
    const { default: TimelineKehidupanPage } = await import("./page");
    render(<TimelineKehidupanPage />);

    await screen.findByText("Lulus kuliah");
    fireEvent.click(screen.getByRole("button", { name: "Karier" }));

    expect(screen.queryByText("Lulus kuliah")).not.toBeInTheDocument();
    expect(screen.getByText("Kerja baru")).toBeInTheDocument();
  });
});
