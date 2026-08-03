// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { VoicePhase } from "@/lib/assistant/useVoiceAssistant";

// jsdom doesn't implement scrollIntoView -- the page calls it on every
// message-list update to keep the chat scrolled to the bottom.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

// These each do their own Supabase/fetch calls on mount -- stubbed out so
// this test only exercises the page's own chat + voice-mode wiring.
vi.mock("@/components/asisten/ActivityLog", () => ({ default: () => <div>ActivityLog</div> }));
vi.mock("@/components/asisten/DataExport", () => ({ default: () => <div>DataExport</div> }));
vi.mock("@/components/asisten/PushNotifications", () => ({ default: () => <div>PushNotifications</div> }));
vi.mock("@/components/asisten/StatusAslan", () => ({ default: () => <div>StatusAslan</div> }));
vi.mock("@/components/asisten/TwoFactorAuth", () => ({ default: () => <div>TwoFactorAuth</div> }));

function chainable(data: unknown[] = []) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    order: () => obj,
    limit: () => obj,
    not: () => obj,
    eq: () => obj,
    delete: () => obj,
    maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
  return obj;
}

function mockSupabase(messages: unknown[] = []) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      from: (table: string) => {
        if (table === "assistant_messages") return chainable(messages);
        if (table === "google_credentials") return chainable([]);
        if (table === "telegram_links") return chainable([]);
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

type VoiceMock = {
  supported?: boolean;
  phase?: VoicePhase;
  errorMsg?: string | null;
  lastReply?: string | null;
  toggle?: () => void;
};

function mockVoice({ supported = true, phase = "idle", errorMsg = null, lastReply = null, toggle = vi.fn() }: VoiceMock = {}) {
  vi.doMock("@/lib/assistant/useVoiceAssistant", () => ({
    useVoiceAssistant: () => ({
      supported,
      phase,
      errorMsg,
      lastReply,
      toggle,
      sendText: vi.fn(),
      audioRef: { current: null },
      model: "claude-sonnet-5",
    }),
  }));
  return { toggle };
}

describe("AsistenPage", () => {
  it("loads and shows past chat history", async () => {
    mockSupabase([
      { id: "1", user_id: "user-1", role: "user", content: "halo", created_at: new Date().toISOString() },
      { id: "2", user_id: "user-1", role: "assistant", content: "Halo balik!", created_at: new Date().toISOString() },
    ]);
    mockVoice();
    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    expect(await screen.findByText("Halo balik!")).toBeInTheDocument();
  });

  it("sends a typed message and streams the reply", async () => {
    mockSupabase([]);
    mockVoice();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          body: {
            getReader: () => {
              let done = false;
              return {
                read: async () => {
                  if (done) return { done: true, value: undefined };
                  done = true;
                  return { done: false, value: new TextEncoder().encode("Siap dicatet!") };
                },
              };
            },
          },
        })
      )
    );

    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    const input = await screen.findByPlaceholderText("Tanya atau minta dicatetin sesuatu...");
    fireEvent.change(input, { target: { value: "catet pengeluaran 50rb" } });
    fireEvent.click(screen.getByText("Kirim"));

    expect(await screen.findByText("Siap dicatet!")).toBeInTheDocument();
  });

  it("shows the voice call UI (and hides the text form) once voice mode is active", async () => {
    mockSupabase([]);
    const { toggle } = mockVoice({ phase: "listening" });
    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    expect(await screen.findByText("Lagi dengerin...")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Tanya atau minta dicatetin sesuatu...")).not.toBeInTheDocument();
    expect(screen.getByText("⏹ Stop Mode Suara")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Hentikan mode suara"));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("shows the voice error message when the hook reports one", async () => {
    mockSupabase([]);
    mockVoice({ phase: "error", errorMsg: "Nggak bisa akses mikrofon." });
    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    expect(await screen.findByText("Nggak bisa akses mikrofon.")).toBeInTheDocument();
  });

  it("hides the voice mode button entirely when the browser doesn't support it", async () => {
    mockSupabase([]);
    mockVoice({ supported: false });
    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    await screen.findByPlaceholderText("Tanya atau minta dicatetin sesuatu...");
    expect(screen.queryByText("🎤 Mode Suara")).not.toBeInTheDocument();
  });
});
