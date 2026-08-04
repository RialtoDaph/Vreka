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
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
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
    gte: () => obj,
    delete: () => obj,
    maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data, error: null, count: data.length }).then(resolve),
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
        if (table === "assistant_memories") return chainable([]);
        if (table === "assistant_audit_log") return chainable([]);
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
  handsFreeSupported?: boolean;
  handsFreeMode?: boolean;
  toggleHandsFree?: () => void;
  mode?: string;
  setMode?: (m: string) => void;
};

function mockVoice({
  supported = true,
  phase = "idle",
  errorMsg = null,
  lastReply = null,
  toggle = vi.fn(),
  handsFreeSupported = true,
  handsFreeMode = false,
  toggleHandsFree = vi.fn(),
  mode = "intel",
  setMode = vi.fn(),
}: VoiceMock = {}) {
  vi.doMock("@/lib/assistant/useVoiceAssistant", () => ({
    useVoiceAssistant: () => ({
      supported,
      phase,
      errorMsg,
      lastReply,
      toggle,
      sendText: vi.fn(),
      audioRef: { current: null },
      mode,
      setMode,
      handsFreeSupported,
      handsFreeMode,
      toggleHandsFree,
    }),
  }));
  return { toggle, toggleHandsFree, setMode };
}

// Routes fetch by URL so a test can stub /api/assistant/providers and
// /api/assistant/chat independently without clobbering each other.
function mockFetchRouter({
  configured,
  chatReply,
  captureChatBody,
}: {
  configured?: Record<string, boolean>;
  chatReply?: string;
  captureChatBody?: (body: Record<string, unknown>) => void;
} = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/assistant/providers") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ configured: configured ?? { anthropic: true, openai: true, gemini: true, grok: true } }),
      });
    }
    if (url === "/api/assistant/chat") {
      if (init?.body) captureChatBody?.(JSON.parse(init.body as string));
      let done = false;
      return Promise.resolve({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: new TextEncoder().encode(chatReply ?? "ok") };
            },
          }),
        },
      });
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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
    expect(screen.getByLabelText("Stop mode suara")).toBeInTheDocument();

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
    expect(screen.queryByLabelText("Mode suara")).not.toBeInTheDocument();
  });

  it("hides the hands-free toolbar button when the browser doesn't support wake-word listening", async () => {
    mockSupabase([]);
    mockVoice({ handsFreeSupported: false });
    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    await screen.findByPlaceholderText("Tanya atau minta dicatetin sesuatu...");
    expect(screen.queryByLabelText(/mode hands-free/i)).not.toBeInTheDocument();
  });

  it("toggles hands-free mode from the toolbar", async () => {
    mockSupabase([]);
    const { toggleHandsFree } = mockVoice({ handsFreeMode: false });
    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    fireEvent.click(await screen.findByLabelText(/nyalain mode hands-free/i));
    expect(toggleHandsFree).toHaveBeenCalledTimes(1);
  });

  it("shows a passive wake-listening indicator without taking over the chat UI", async () => {
    mockSupabase([]);
    mockVoice({ phase: "wake-listening", handsFreeMode: true });
    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    expect(await screen.findByText(/bilang.*aslan/i)).toBeInTheDocument();
    // Unlike an active call, wake-listening keeps the text input visible.
    expect(screen.getByPlaceholderText("Tanya atau minta dicatetin sesuatu...")).toBeInTheDocument();
  });

  it("disables mode buttons whose provider key isn't configured on the server", async () => {
    mockSupabase([]);
    mockVoice();
    mockFetchRouter({ configured: { anthropic: true, openai: false, gemini: false, grok: false } });

    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    expect(await screen.findByRole("button", { name: /Santai/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Fokus/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Ultra/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Intel/ })).not.toBeDisabled();
  });

  it("does not disable any mode button while the provider status is still loading", async () => {
    mockSupabase([]);
    mockVoice();
    mockFetchRouter();

    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    expect(await screen.findByRole("button", { name: /Santai/ })).not.toBeDisabled();
  });

  it("marks the active mode's button pressed and calls setMode when a different mode is clicked", async () => {
    mockSupabase([]);
    const { setMode } = mockVoice({ mode: "intel" });
    mockFetchRouter();

    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    const intelButton = await screen.findByRole("button", { name: /Intel/ });
    expect(intelButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Fokus/ })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: /Fokus/ }));
    expect(setMode).toHaveBeenCalledWith("fokus");
  });

  it("sends the active mode (not a model id) in the chat request body", async () => {
    mockSupabase([]);
    mockVoice({ mode: "fokus" });
    const captured: Record<string, unknown>[] = [];
    mockFetchRouter({ captureChatBody: (body) => captured.push(body) });

    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    const input = await screen.findByPlaceholderText("Tanya atau minta dicatetin sesuatu...");
    fireEvent.change(input, { target: { value: "cari tren terkini" } });
    fireEvent.click(screen.getByText("Kirim"));

    await screen.findByText("ok");
    expect(captured[0]).toMatchObject({ mode: "fokus" });
  });

  it("starts and stops screen share from the toolbar, showing the active banner while sharing", async () => {
    mockSupabase([]);
    mockVoice();
    mockFetchRouter();
    const stop = vi.fn();
    const addEventListener = vi.fn();
    const getDisplayMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }],
      getVideoTracks: () => [{ addEventListener }],
    });
    Object.defineProperty(navigator, "mediaDevices", { value: { getDisplayMedia }, configurable: true });

    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    fireEvent.click(await screen.findByLabelText("Share screen ke Aslan"));
    expect(await screen.findByText(/Screen share aktif/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Matiin screen share"));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Screen share aktif/)).not.toBeInTheDocument();
  });

  it("shows an error and stays inactive when the browser denies screen share", async () => {
    mockSupabase([]);
    mockVoice();
    mockFetchRouter();
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getDisplayMedia: vi.fn().mockRejectedValue(new Error("NotAllowedError")) },
      configurable: true,
    });

    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    fireEvent.click(await screen.findByLabelText("Share screen ke Aslan"));
    expect(await screen.findByText(/Gagal mulai screen share/)).toBeInTheDocument();
    expect(screen.queryByText(/Screen share aktif/)).not.toBeInTheDocument();
  });

  it("renders a short assistant reply as a plain bubble with no pagination chrome", async () => {
    mockSupabase([
      { id: "1", user_id: "user-1", role: "assistant", content: "Oke, siap!", created_at: new Date().toISOString() },
    ]);
    mockVoice();
    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    expect(await screen.findByText("Oke, siap!")).toBeInTheDocument();
    expect(screen.queryByLabelText("Slide berikutnya")).not.toBeInTheDocument();
  });

  it("splits a long assistant reply into swipeable/paginated slides", async () => {
    // getByText normalizes (trims) the rendered text, so these can't have
    // trailing whitespace or the exact-match comparison would never hit.
    const paraOne = "Bagian pertama. ".repeat(25).trim(); // ~400 chars
    const paraTwo = "Bagian kedua. ".repeat(25).trim(); // ~350 chars
    mockSupabase([
      {
        id: "1",
        user_id: "user-1",
        role: "assistant",
        content: `${paraOne}\n\n${paraTwo}`,
        created_at: new Date().toISOString(),
      },
    ]);
    mockVoice();
    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    expect(await screen.findByText("1/2")).toBeInTheDocument();
    expect(screen.getByText(paraOne)).toBeInTheDocument();
    expect(screen.queryByText(paraTwo)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Slide berikutnya"));

    expect(await screen.findByText("2/2")).toBeInTheDocument();
    expect(screen.getByText(paraTwo)).toBeInTheDocument();
    expect(screen.queryByText(paraOne)).not.toBeInTheDocument();
  });
});
