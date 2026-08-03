import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function chainable(result: { data: unknown; error?: unknown } = { data: null, error: null }) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    update: () => obj,
    eq: () => obj,
    not: () => obj,
    maybeSingle: () => Promise.resolve(result),
  };
  return obj;
}

function mockAdmin(linkResult: { data: unknown; error?: unknown }) {
  vi.doMock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({ from: () => chainable(linkResult) }),
  }));
}

function mockSendTelegramMessage() {
  const sendTelegramMessage = vi.fn().mockResolvedValue(undefined);
  vi.doMock("@/lib/telegram/bot", () => ({ sendTelegramMessage }));
  return sendTelegramMessage;
}

function mockRunAssistantChat(reply = "ok") {
  const runAssistantChat = vi.fn().mockResolvedValue(reply);
  vi.doMock("@/lib/assistant/run", () => ({ runAssistantChat }));
  return runAssistantChat;
}

function messageUpdate(text: string, chatId = 111) {
  return { update_id: 1, message: { message_id: 1, chat: { id: chatId }, text } };
}

function req(body: unknown, secret = "test-secret") {
  return new NextRequest("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/telegram/webhook", () => {
  it("rejects requests with the wrong secret token", async () => {
    mockAdmin({ data: null, error: null });
    mockSendTelegramMessage();
    mockRunAssistantChat();
    const { POST } = await import("./route");
    const res = await POST(req(messageUpdate("halo"), "wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("replies via Aslan for a linked chat", async () => {
    mockAdmin({ data: { user_id: "user-1" }, error: null });
    const sendTelegramMessage = mockSendTelegramMessage();
    const runAssistantChat = mockRunAssistantChat("Halo balik!");
    const { POST } = await import("./route");
    const res = await POST(req(messageUpdate("halo")));

    expect(res.status).toBe(200);
    expect(runAssistantChat).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage).toHaveBeenCalledWith(111, "Halo balik!");
  });

  it("stops calling Aslan once the per-chat rate limit is hit, and tells the user to slow down", async () => {
    mockAdmin({ data: { user_id: "user-1" }, error: null });
    const sendTelegramMessage = mockSendTelegramMessage();
    const runAssistantChat = mockRunAssistantChat("balasan");
    const { POST } = await import("./route");

    for (let i = 0; i < 20; i++) {
      await POST(req(messageUpdate(`pesan ke-${i}`, 222)));
    }
    expect(runAssistantChat).toHaveBeenCalledTimes(20);

    await POST(req(messageUpdate("pesan ke-21", 222)));
    expect(runAssistantChat).toHaveBeenCalledTimes(20);
    expect(sendTelegramMessage).toHaveBeenLastCalledWith(222, "Kebanyakan pesan, tunggu bentar ya.");
  });
});
