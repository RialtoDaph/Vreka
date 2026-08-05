// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

// Reads are plain select().order() thenables; tasks/task_subtasks/habits
// also support update(payload).eq("id", value), which mutates the matching
// fixture row in place so a page's post-save reload() sees the change.
type Row = Record<string, unknown>;

function mockSupabase(taskRows: Row[], subtaskRows: Row[]) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: (table: string) => {
        const rows = table === "tasks" ? taskRows : table === "task_subtasks" ? subtaskRows : table === "habits" ? [] : null;
        if (rows) {
          return {
            select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
            update: (payload: Row) => ({
              eq: (_col: string, value: unknown) => {
                const row = rows.find((r) => r.id === value);
                if (row) Object.assign(row, payload);
                return Promise.resolve({ error: null });
              },
            }),
          };
        }
        if (table === "habit_checks") {
          return { select: () => Promise.resolve({ data: [], error: null }) };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

describe("KerjaanPage (Kanban)", () => {
  it("sorts tasks into their status column and shows the sub-task tally", async () => {
    mockSupabase(
      [
        { id: "t1", title: "Kirim laporan", status: "todo", priority: "high", deadline: null, description: null },
        { id: "t2", title: "Review PR", status: "in_progress", priority: "medium", deadline: null, description: null },
        { id: "t3", title: "Setup CI", status: "done", priority: "low", deadline: null, description: null },
      ],
      [
        { id: "s1", task_id: "t1", title: "Tulis draft", done: true, user_id: "u1", created_at: "2026-01-01" },
        { id: "s2", task_id: "t1", title: "Kirim ke atasan", done: false, user_id: "u1", created_at: "2026-01-02" },
      ]
    );
    const { default: KerjaanPage } = await import("./page");
    render(<KerjaanPage />);

    expect(await screen.findByText("Kirim laporan")).toBeInTheDocument();

    const todoColumn = screen.getByText("To-do").closest("div.relative") as HTMLElement;
    const inProgressColumn = screen.getByText("In Progress").closest("div.relative") as HTMLElement;
    const doneColumn = screen.getByText("Selesai").closest("div.relative") as HTMLElement;

    expect(within(todoColumn).getByText("Kirim laporan")).toBeInTheDocument();
    expect(within(inProgressColumn).getByText("Review PR")).toBeInTheDocument();
    expect(within(doneColumn).getByText("Setup CI")).toBeInTheDocument();

    // 1 of 2 sub-tasks done for "Kirim laporan".
    expect(within(todoColumn).getByText(/1\/2 sub-task/)).toBeInTheDocument();
  });

  it("shows an empty column when no tasks have that status", async () => {
    mockSupabase(
      [{ id: "t1", title: "Solo task", status: "todo", priority: "medium", deadline: null, description: null }],
      []
    );
    const { default: KerjaanPage } = await import("./page");
    render(<KerjaanPage />);

    expect(await screen.findByText("Solo task")).toBeInTheDocument();
    const doneColumn = screen.getByText("Selesai").closest("div.relative") as HTMLElement;
    expect(within(doneColumn).getByText("Kosong.")).toBeInTheDocument();
  });

  it("edits an existing task's title", async () => {
    mockSupabase(
      [{ id: "t1", title: "Kirim laporan", status: "todo", priority: "high", deadline: null, description: null, project: null }],
      []
    );
    const { default: KerjaanPage } = await import("./page");
    render(<KerjaanPage />);

    await screen.findByText("Kirim laporan");
    fireEvent.click(screen.getByLabelText("Edit to-do Kirim laporan"));

    const titleInput = screen.getByDisplayValue("Kirim laporan");
    fireEvent.change(titleInput, { target: { value: "Kirim laporan mingguan" } });
    fireEvent.click(screen.getByText("Update To-do"));

    await waitFor(() => expect(screen.getByText("Kirim laporan mingguan")).toBeInTheDocument());
  });

  it("renames a sub-task inline", async () => {
    mockSupabase(
      [{ id: "t1", title: "Kirim laporan", status: "todo", priority: "high", deadline: null, description: null }],
      [{ id: "s1", task_id: "t1", title: "Tulis draft", done: false, user_id: "u1", created_at: "2026-01-01" }]
    );
    const { default: KerjaanPage } = await import("./page");
    render(<KerjaanPage />);

    await screen.findByText("Kirim laporan");
    fireEvent.click(screen.getByText(/0\/1 sub-task/));
    fireEvent.click(screen.getByText("Tulis draft"));

    const subtaskInput = screen.getByDisplayValue("Tulis draft");
    fireEvent.change(subtaskInput, { target: { value: "Tulis draft v2" } });
    fireEvent.keyDown(subtaskInput, { key: "Enter" });

    await waitFor(() => expect(screen.getByText("Tulis draft v2")).toBeInTheDocument());
  });
});
