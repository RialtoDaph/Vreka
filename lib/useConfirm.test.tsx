// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useConfirm } from "./useConfirm";

afterEach(() => cleanup());

function Harness() {
  const { confirm, confirmDialog } = useConfirm();
  return (
    <div>
      <button
        onClick={async () => {
          const ok = await confirm("Yakin mau hapus?");
          document.getElementById("result")!.textContent = ok ? "confirmed" : "cancelled";
        }}
      >
        Hapus
      </button>
      <p id="result" />
      {confirmDialog}
    </div>
  );
}

describe("useConfirm", () => {
  it("resolves true when the dialog is confirmed", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Hapus"));

    expect(await screen.findByText("Yakin mau hapus?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ya, lanjut"));

    await waitFor(() => expect(screen.getByText("confirmed")).toBeInTheDocument());
    expect(screen.queryByText("Yakin mau hapus?")).not.toBeInTheDocument();
  });

  it("resolves false when the dialog is cancelled, and can be reopened after", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Hapus"));
    fireEvent.click(await screen.findByText("Batal"));

    await waitFor(() => expect(screen.getByText("cancelled")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Hapus"));
    expect(await screen.findByText("Yakin mau hapus?")).toBeInTheDocument();
  });
});
