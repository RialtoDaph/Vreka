// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

const STICKY = {
  id: "n1",
  user_id: "user-1",
  kind: "sticky",
  x: 10,
  y: 10,
  w: 200,
  h: 150,
  text: "Catatan awal",
  color: "#4be8ff",
  label: null,
  created_at: "t",
  updated_at: "t",
};

const TASK = {
  id: "n2",
  user_id: "user-1",
  kind: "task",
  x: 300,
  y: 10,
  w: 220,
  h: 110,
  text: "Deploy ke prod",
  color: null,
  label: "Sprint 1",
  created_at: "t",
  updated_at: "t",
};

// Chainable Supabase table double covering the exact chains
// app/dashboard/canvas/page.tsx issues: select().order() / select() reads,
// insert().select().single() writes, delete().eq() / update().eq() writes.
function chainableTable(rows: unknown[]) {
  let newId = 0;
  let pendingInsert: Record<string, unknown> | null = null;
  const obj: Record<string, unknown> = {
    select: () => obj,
    order: () => obj,
    eq: () => obj,
    update: () => obj,
    delete: () => obj,
    insert: (payload: Record<string, unknown>) => {
      pendingInsert = payload;
      return obj;
    },
    single: () =>
      Promise.resolve({
        data: pendingInsert
          ? { id: `new-${++newId}`, created_at: "now", updated_at: "now", ...pendingInsert }
          : null,
        error: null,
      }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return obj;
}

function mockSupabase({ nodes = [] as unknown[], arrows = [] as unknown[] } = {}) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      from: (table: string) => {
        if (table === "canvas_nodes") return chainableTable(nodes);
        if (table === "canvas_arrows") return chainableTable(arrows);
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

describe("CanvasKerjaPage", () => {
  it("renders existing nodes and the item count", async () => {
    mockSupabase({ nodes: [STICKY, TASK] });
    const { default: CanvasKerjaPage } = await import("./page");
    render(<CanvasKerjaPage />);

    expect(await screen.findByDisplayValue("Catatan awal")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Deploy ke prod")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Sprint 1")).toBeInTheDocument();
    expect(screen.getByText("Modul 08 · 2 item")).toBeInTheDocument();
  });

  it("shows an empty-state hint when there are no nodes", async () => {
    mockSupabase({ nodes: [] });
    const { default: CanvasKerjaPage } = await import("./page");
    render(<CanvasKerjaPage />);

    expect(
      await screen.findByText('Kosong -- klik "+ Sticky" atau "+ Kartu Tugas" buat mulai.')
    ).toBeInTheDocument();
  });

  it("adds a new sticky note", async () => {
    mockSupabase({ nodes: [] });
    const { default: CanvasKerjaPage } = await import("./page");
    render(<CanvasKerjaPage />);

    await screen.findByText("Modul 08 · 0 item");
    fireEvent.click(screen.getByText("+ Sticky"));

    await waitFor(() => expect(screen.getByText("Modul 08 · 1 item")).toBeInTheDocument());
    expect(screen.getByPlaceholderText("Tulis catatan...")).toBeInTheDocument();
  });

  it("deletes a node", async () => {
    mockSupabase({ nodes: [STICKY] });
    const { default: CanvasKerjaPage } = await import("./page");
    render(<CanvasKerjaPage />);

    await screen.findByDisplayValue("Catatan awal");
    fireEvent.click(screen.getByLabelText("Hapus kartu sticky"));

    await waitFor(() => expect(screen.queryByDisplayValue("Catatan awal")).not.toBeInTheDocument());
    expect(
      await screen.findByText('Kosong -- klik "+ Sticky" atau "+ Kartu Tugas" buat mulai.')
    ).toBeInTheDocument();
  });

  it("draws an arrow after linking two nodes", async () => {
    mockSupabase({ nodes: [STICKY, TASK] });
    const { default: CanvasKerjaPage } = await import("./page");
    const { container } = render(<CanvasKerjaPage />);

    await screen.findByDisplayValue("Catatan awal");
    const nodeEls = container.querySelectorAll("[data-node]");
    expect(nodeEls).toHaveLength(2);

    const linkPoint = nodeEls[0].lastElementChild!;
    fireEvent.pointerDown(linkPoint);
    fireEvent.pointerDown(nodeEls[1]);

    await waitFor(() => expect(container.querySelectorAll("line[marker-end]")).toHaveLength(1));
  });

  it("still completes a link when the pointer is released between arming and clicking the target", async () => {
    // A real click on the link dot fires pointerdown *and* pointerup before
    // the user ever clicks the target node -- the pointerup used to clear
    // linkingFrom on the stage handler, silently breaking every real-world
    // (as opposed to single-gesture-test) attempt to link two cards.
    mockSupabase({ nodes: [STICKY, TASK] });
    const { default: CanvasKerjaPage } = await import("./page");
    const { container } = render(<CanvasKerjaPage />);

    await screen.findByDisplayValue("Catatan awal");
    const nodeEls = container.querySelectorAll("[data-node]");
    const linkPoint = nodeEls[0].lastElementChild!;

    fireEvent.pointerDown(linkPoint);
    fireEvent.pointerUp(linkPoint);
    fireEvent.pointerDown(nodeEls[1]);

    await waitFor(() => expect(container.querySelectorAll("line[marker-end]")).toHaveLength(1));
  });

  it("cancels an armed link when clicking empty canvas instead of a node", async () => {
    mockSupabase({ nodes: [STICKY, TASK] });
    const { default: CanvasKerjaPage } = await import("./page");
    const { container } = render(<CanvasKerjaPage />);

    await screen.findByDisplayValue("Catatan awal");
    const nodeEls = container.querySelectorAll("[data-node]");
    const linkPoint = nodeEls[0].lastElementChild!;
    const stage = container.querySelector("svg")!.parentElement!;

    fireEvent.pointerDown(linkPoint);
    fireEvent.pointerUp(linkPoint);
    fireEvent.pointerDown(stage, { clientX: 500, clientY: 500 });
    fireEvent.pointerDown(nodeEls[1]);

    expect(container.querySelectorAll("line[marker-end]")).toHaveLength(0);
  });

  it("recolors a sticky note by clicking a color swatch", async () => {
    mockSupabase({ nodes: [STICKY] });
    const { default: CanvasKerjaPage } = await import("./page");
    const { container } = render(<CanvasKerjaPage />);

    await screen.findByDisplayValue("Catatan awal");
    const nodeEl = container.querySelector("[data-node]") as HTMLElement;
    // jsdom normalizes hex to rgb() in the serialized inline style.
    expect(nodeEl.style.borderLeft).toContain("rgb(75, 232, 255)");

    fireEvent.click(screen.getByLabelText("Warna #ffb454"));

    await waitFor(() => expect(nodeEl.style.borderLeft).toContain("rgb(255, 180, 84)"));
  });

  it("recolors a task card too, not just stickies", async () => {
    mockSupabase({ nodes: [TASK] });
    const { default: CanvasKerjaPage } = await import("./page");
    const { container } = render(<CanvasKerjaPage />);

    await screen.findByDisplayValue("Deploy ke prod");
    const nodeEl = container.querySelector("[data-node]") as HTMLElement;
    expect(nodeEl.style.borderLeft).toContain("rgb(75, 232, 255)");

    fireEvent.click(screen.getByLabelText("Warna #b98bff"));

    await waitFor(() => expect(nodeEl.style.borderLeft).toContain("rgb(185, 139, 255)"));
  });

  it("pinch-zooms via two simultaneous touch pointers", async () => {
    mockSupabase({ nodes: [] });
    const { default: CanvasKerjaPage } = await import("./page");
    const { container } = render(<CanvasKerjaPage />);

    const stage = container.querySelector("svg")!.parentElement!;
    expect(await screen.findByText("100%")).toBeInTheDocument();

    // Two fingers 20px apart, then spread to 100px apart (5x) -- clamped to
    // MAX_ZOOM (2), i.e. 200%, since 1 * 5 exceeds the cap.
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(stage, { pointerId: 2, clientX: 120, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 60, clientY: 100 });
    fireEvent.pointerMove(stage, { pointerId: 2, clientX: 160, clientY: 100 });

    await waitFor(() => expect(screen.getByText("200%")).toBeInTheDocument());
  });
});
