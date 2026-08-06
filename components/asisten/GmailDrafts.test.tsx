// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import GmailDrafts from "./GmailDrafts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const DRAFT = { id: "d1", to: "a@b.com", subject: "Halo", snippet: "Cuplikan isi" };

function stubFetch(handlers: Record<string, { ok?: boolean; body: unknown }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const key = Object.keys(handlers).find((k) => url.includes(k));
      const res = key ? handlers[key] : { ok: true, body: {} };
      return Promise.resolve({ ok: res.ok ?? true, json: async () => res.body });
    })
  );
}

describe("GmailDrafts", () => {
  it("shows an empty state when there are no drafts", async () => {
    stubFetch({ "/drafts": { body: { connected: true, drafts: [] } } });
    render(<GmailDrafts />);
    expect(await screen.findByText(/Nggak ada draft nunggu/)).toBeInTheDocument();
  });

  it("lists a pending draft with its subject and recipient", async () => {
    stubFetch({ "/drafts": { body: { connected: true, drafts: [DRAFT] } } });
    render(<GmailDrafts />);
    expect(await screen.findByText("Halo")).toBeInTheDocument();
    expect(screen.getByText("Ke: a@b.com")).toBeInTheDocument();
  });

  it("sends a draft after confirming, and removes it from the list", async () => {
    vi.stubGlobal("confirm", () => true);
    stubFetch({
      "/drafts/send": { body: { ok: true } },
      "/drafts": { body: { connected: true, drafts: [DRAFT] } },
    });
    render(<GmailDrafts />);

    fireEvent.click(await screen.findByText("Kirim"));
    await waitFor(() => expect(screen.queryByText("Halo")).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      "/api/google/gmail/drafts/send",
      expect.objectContaining({ body: JSON.stringify({ id: "d1" }) })
    );
  });

  it("does not send when the confirm dialog is declined", async () => {
    vi.stubGlobal("confirm", () => false);
    stubFetch({ "/drafts": { body: { connected: true, drafts: [DRAFT] } } });
    render(<GmailDrafts />);

    fireEvent.click(await screen.findByText("Kirim"));
    expect(screen.getByText("Halo")).toBeInTheDocument();
  });

  it("discards a draft after confirming", async () => {
    vi.stubGlobal("confirm", () => true);
    stubFetch({
      "/drafts/delete": { body: { ok: true } },
      "/drafts": { body: { connected: true, drafts: [DRAFT] } },
    });
    render(<GmailDrafts />);

    fireEvent.click(await screen.findByText("Buang draft"));
    await waitFor(() => expect(screen.queryByText("Halo")).not.toBeInTheDocument());
  });

  it("shows an error message when the send fails", async () => {
    vi.stubGlobal("confirm", () => true);
    stubFetch({
      "/drafts/send": { ok: false, body: { error: "Token kadaluarsa." } },
      "/drafts": { body: { connected: true, drafts: [DRAFT] } },
    });
    render(<GmailDrafts />);

    fireEvent.click(await screen.findByText("Kirim"));
    expect(await screen.findByText("Token kadaluarsa.")).toBeInTheDocument();
    // Still listed -- the send didn't actually succeed.
    expect(screen.getByText("Halo")).toBeInTheDocument();
  });
});
