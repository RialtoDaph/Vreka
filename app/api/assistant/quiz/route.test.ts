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
  return new NextRequest("http://localhost/api/assistant/quiz", {
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

describe("POST /api/assistant/quiz", () => {
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

  it("returns 422 when the note has no content to quiz on", async () => {
    mockSupabase({ user: { id: "user-1" }, note: { title: "Kosong", content: "" } });
    mockAnthropicResponse({});
    const { POST } = await import("./route");
    const res = await POST(req({ noteId: "note-1" }));
    expect(res.status).toBe(422);
  });

  it("returns generated questions for a note with content", async () => {
    mockSupabase({
      user: { id: "user-1" },
      note: { title: "Bahasa Jerman A2", content: "Der/die/das artikel..." },
    });
    mockAnthropicResponse({
      questions: [
        { question: "Artikel buat kata netral?", options: ["der", "die", "das", "den"], correct_index: 2 },
      ],
    });
    const { POST } = await import("./route");
    const res = await POST(req({ noteId: "note-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].correct_index).toBe(2);
  });

  it("drops malformed questions (e.g. correct_index out of range) instead of crashing", async () => {
    mockSupabase({
      user: { id: "user-1" },
      note: { title: "T", content: "isi" },
    });
    mockAnthropicResponse({
      questions: [
        { question: "Valid?", options: ["a", "b"], correct_index: 0 },
        { question: "Rusak", options: ["a", "b"], correct_index: 5 },
      ],
    });
    const { POST } = await import("./route");
    const res = await POST(req({ noteId: "note-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].question).toBe("Valid?");
  });
});
