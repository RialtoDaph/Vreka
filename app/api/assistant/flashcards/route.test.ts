import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function mockSupabase({
  user,
  note,
  noteError,
}: {
  user: { id: string } | null;
  note?: { title: string; content: string | null } | null;
  noteError?: { message: string };
}) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: note ?? null, error: noteError ?? null }),
          }),
        }),
      }),
    }),
  }));
}

function mockAnthropicResponse(json: unknown) {
  vi.doMock("@anthropic-ai/sdk", () => ({
    default: class {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify(json) }],
        }),
      };
    },
  }));
}

function req(body: unknown) {
  return new NextRequest("http://localhost/api/assistant/flashcards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/assistant/flashcards", () => {
  it("rejects unauthenticated requests", async () => {
    mockSupabase({ user: null });
    mockAnthropicResponse({});
    const { POST } = await import("./route");
    const res = await POST(req({ noteId: "note-1" }));
    expect(res.status).toBe(401);
  });

  it("rejects a missing noteId", async () => {
    mockSupabase({ user: { id: "user-1" } });
    mockAnthropicResponse({});
    const { POST } = await import("./route");
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the note doesn't exist (or isn't the user's, via RLS)", async () => {
    mockSupabase({ user: { id: "user-1" }, note: null });
    mockAnthropicResponse({});
    const { POST } = await import("./route");
    const res = await POST(req({ noteId: "note-1" }));
    expect(res.status).toBe(404);
  });

  it("returns 422 when the note has no content to make cards from", async () => {
    mockSupabase({ user: { id: "user-1" }, note: { title: "Kosong", content: "" } });
    mockAnthropicResponse({});
    const { POST } = await import("./route");
    const res = await POST(req({ noteId: "note-1" }));
    expect(res.status).toBe(422);
  });

  it("returns generated cards for a note with content", async () => {
    mockSupabase({
      user: { id: "user-1" },
      note: { title: "Bahasa Inggris B1", content: "though = walaupun, meskipun" },
    });
    mockAnthropicResponse({
      cards: [{ front: "though", back: "walaupun, meskipun" }],
    });
    const { POST } = await import("./route");
    const res = await POST(req({ noteId: "note-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]).toEqual({ front: "though", back: "walaupun, meskipun" });
  });

  it("drops malformed cards (missing/empty front or back) instead of crashing", async () => {
    mockSupabase({
      user: { id: "user-1" },
      note: { title: "T", content: "isi" },
    });
    mockAnthropicResponse({
      cards: [
        { front: "valid", back: "kartu" },
        { front: "", back: "kosong" },
        { front: "no back field" },
      ],
    });
    const { POST } = await import("./route");
    const res = await POST(req({ noteId: "note-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0].front).toBe("valid");
  });
});
