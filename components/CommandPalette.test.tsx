// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
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
});
