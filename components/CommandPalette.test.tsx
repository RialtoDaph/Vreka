// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  // Default: no data-search results, so the pre-existing module-navigation
  // tests below don't have to know the palette also hits /api/search now.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
  );
});

afterEach(() => {
  cleanup();
  push.mockClear();
  vi.unstubAllGlobals();
});

describe("CommandPalette", () => {
  it("stays closed until Cmd/Ctrl+K is pressed", async () => {
    const { default: CommandPalette } = await import("./CommandPalette");
    render(<CommandPalette />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on Ctrl+K and lists every module", async () => {
    const { default: CommandPalette } = await import("./CommandPalette");
    render(<CommandPalette />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Keuangan")).toBeInTheDocument();
    expect(screen.getByText("Jurnal")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const { default: CommandPalette } = await import("./CommandPalette");
    render(<CommandPalette />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("filters the list by typed query, matching keywords too", async () => {
    const { default: CommandPalette } = await import("./CommandPalette");
    render(<CommandPalette />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByPlaceholderText("Ketik buat cari modul...");
    fireEvent.change(input, { target: { value: "kuis" } });

    expect(screen.getByText("Pelajaran")).toBeInTheDocument();
    expect(screen.queryByText("Keuangan")).not.toBeInTheDocument();
  });

  it("navigates to the highlighted command on Enter", async () => {
    const { default: CommandPalette } = await import("./CommandPalette");
    render(<CommandPalette />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByPlaceholderText("Ketik buat cari modul...");
    fireEvent.change(input, { target: { value: "jurnal" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/dashboard/jurnal");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a no-results message when nothing matches", async () => {
    const { default: CommandPalette } = await import("./CommandPalette");
    render(<CommandPalette />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByPlaceholderText("Ketik buat cari modul...");
    fireEvent.change(input, { target: { value: "zzzznotfound" } });

    expect(screen.getByText("Nggak ketemu.")).toBeInTheDocument();
  });

  it("shows live data search results and navigates to their module on click", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              source: "task",
              id: "t1",
              title: "Beli oleh-oleh",
              snippet: "todo",
              date: "2026-08-01",
              href: "/dashboard/kerjaan",
            },
          ],
        }),
      })
    );

    const { default: CommandPalette } = await import("./CommandPalette");
    render(<CommandPalette />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByPlaceholderText("Ketik buat cari modul...");
    fireEvent.change(input, { target: { value: "oleh-oleh" } });

    const result = await waitFor(() => screen.getByText("Beli oleh-oleh"));
    fireEvent.click(result);

    expect(push).toHaveBeenCalledWith("/dashboard/kerjaan");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("doesn't fetch data results for a single-character query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const { default: CommandPalette } = await import("./CommandPalette");
    render(<CommandPalette />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByPlaceholderText("Ketik buat cari modul...");
    fireEvent.change(input, { target: { value: "k" } });

    await new Promise((r) => setTimeout(r, 300));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
