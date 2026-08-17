// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DataImport from "./DataImport";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonFile(content: unknown) {
  return new File([JSON.stringify(content)], "vreka-export.json", { type: "application/json" });
}

function pickFile(file: File) {
  const input = screen.getByLabelText("Pilih file export") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("DataImport", () => {
  it("shows an error for a file that isn't valid JSON", async () => {
    render(<DataImport />);
    pickFile(new File(["not json"], "bad.json", { type: "application/json" }));
    expect(await screen.findByText("File bukan JSON yang valid.")).toBeInTheDocument();
  });

  it("does nothing when the confirm dialog is declined", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<DataImport />);
    pickFile(jsonFile({ data: { tasks: [{ id: "t1" }] } }));

    fireEvent.click(await screen.findByText("Batal"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("imports after confirming and shows a summary of imported rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: { accounts: { imported: 1 }, tasks: { imported: 2 } } }),
      })
    );
    render(<DataImport />);
    pickFile(jsonFile({ data: { tasks: [{ id: "t1" }, { id: "t2" }], accounts: [{ id: "a1" }] } }));

    fireEvent.click(await screen.findByText("Ya, lanjut"));

    expect(await screen.findByText(/3 baris berhasil di-import\./)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/data-import",
      expect.objectContaining({
        body: JSON.stringify({ data: { tasks: [{ id: "t1" }, { id: "t2" }], accounts: [{ id: "a1" }] } }),
      })
    );
  });

  it("flags which tables failed alongside the ones that succeeded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: { accounts: { imported: 0, error: "boom" }, tasks: { imported: 2 } },
        }),
      })
    );
    render(<DataImport />);
    pickFile(jsonFile({ data: { tasks: [{ id: "t1" }, { id: "t2" }] } }));

    fireEvent.click(await screen.findByText("Ya, lanjut"));

    expect(await screen.findByText(/Gagal di: accounts\./)).toBeInTheDocument();
  });

  it("shows a server error message when the import request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "File export nggak valid." }) })
    );
    render(<DataImport />);
    pickFile(jsonFile({ data: {} }));

    fireEvent.click(await screen.findByText("Ya, lanjut"));

    await waitFor(() => expect(screen.getByText("File export nggak valid.")).toBeInTheDocument());
  });
});
