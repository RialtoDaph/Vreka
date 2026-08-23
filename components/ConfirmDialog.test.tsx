// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ConfirmDialog from "./ConfirmDialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ConfirmDialog", () => {
  it("shows the message and calls onConfirm/onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog message="Yakin mau hapus ini?" onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByText("Yakin mau hapus ini?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ya, lanjut"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels on Escape and on backdrop click", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog message="Yakin?" onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("alertdialog").parentElement!);
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("supports custom labels", () => {
    render(
      <ConfirmDialog
        message="Kirim email ini?"
        confirmLabel="Kirim"
        cancelLabel="Jangan"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText("Kirim")).toBeInTheDocument();
    expect(screen.getByText("Jangan")).toBeInTheDocument();
  });
});
