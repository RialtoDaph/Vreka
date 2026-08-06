import { afterEach, describe, expect, it, vi } from "vitest";
import { listDrafts, sendDraft, deleteDraft } from "./gmail";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("listDrafts", () => {
  it("fetches To/Subject/snippet for each draft in the list", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/drafts?")) {
        return { ok: true, json: async () => ({ drafts: [{ id: "d1", message: { id: "m1" } }] }) };
      }
      return {
        ok: true,
        json: async () => ({
          message: {
            snippet: "Cuplikan isi",
            payload: { headers: [{ name: "To", value: "a@b.com" }, { name: "Subject", value: "Halo" }] },
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const drafts = await listDrafts("token-1");
    expect(drafts).toEqual([{ id: "d1", to: "a@b.com", subject: "Halo", snippet: "Cuplikan isi" }]);
  });

  it("returns an empty list when there are no drafts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await listDrafts("token-1")).toEqual([]);
  });

  it("falls back gracefully when a single draft's detail fetch fails", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/drafts?")) {
        return { ok: true, json: async () => ({ drafts: [{ id: "d1", message: { id: "m1" } }] }) };
      }
      return { ok: false, status: 404, text: async () => "not found" };
    });
    vi.stubGlobal("fetch", fetchMock);

    const drafts = await listDrafts("token-1");
    expect(drafts).toEqual([{ id: "d1", to: "(nggak kebaca)", subject: "(nggak kebaca)", snippet: "" }]);
  });

  it("throws when the draft list itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));
    await expect(listDrafts("token-1")).rejects.toThrow();
  });
});

describe("sendDraft", () => {
  it("POSTs the draft id to drafts/send", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await sendDraft("token-1", "d1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/drafts/send"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "d1" }) })
    );
  });

  it("throws on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad" }));
    await expect(sendDraft("token-1", "d1")).rejects.toThrow();
  });
});

describe("deleteDraft", () => {
  it("DELETEs the draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await deleteDraft("token-1", "d1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/drafts/d1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("treats an already-gone (404) draft as success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" }));
    await expect(deleteDraft("token-1", "d1")).resolves.toBeUndefined();
  });
});
