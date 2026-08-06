import { afterEach, describe, expect, it, vi } from "vitest";
import { updateEvent, deleteEvent } from "./calendar";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFetch(response: { ok: boolean; status?: number; body: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: async () => response.body,
    text: async () => (typeof response.body === "string" ? response.body : JSON.stringify(response.body)),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("updateEvent", () => {
  it("PATCHes only the fields that were passed", async () => {
    const fetchMock = mockFetch({ ok: true, body: { id: "e1", summary: "Standup baru" } });
    await updateEvent("token-1", "e1", { summary: "Standup baru" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/events/e1"),
      expect.objectContaining({ method: "PATCH" })
    );
    const sentBody = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(sentBody).toEqual({ summary: "Standup baru" });
  });

  it("throws Google's human-readable error message on failure", async () => {
    mockFetch({ ok: false, status: 404, body: { error: { message: "Not Found" } } });
    await expect(updateEvent("token-1", "missing", { summary: "x" })).rejects.toThrow("Not Found");
  });
});

describe("deleteEvent", () => {
  it("DELETEs the event", async () => {
    const fetchMock = mockFetch({ ok: true, body: {} });
    await deleteEvent("token-1", "e1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/events/e1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("treats an already-deleted (410) event as success", async () => {
    mockFetch({ ok: false, status: 410, body: {} });
    await expect(deleteEvent("token-1", "e1")).resolves.toBeUndefined();
  });

  it("throws on a real failure", async () => {
    mockFetch({ ok: false, status: 500, body: { error: { message: "Server error" } } });
    await expect(deleteEvent("token-1", "e1")).rejects.toThrow("Server error");
  });
});
