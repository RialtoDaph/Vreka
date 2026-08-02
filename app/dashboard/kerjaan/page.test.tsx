// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

function mockSupabase(taskRows: unknown[], subtaskRows: unknown[]) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: (table: string) => {
        if (table === "tasks") {
          return { select: () => ({ order: () => Promise.resolve({ data: taskRows, error: null }) }) };
        }
        if (table === "task_subtasks") {
          return { select: () => ({ order: () => Promise.resolve({ data: subtaskRows, error: null }) }) };
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
});
