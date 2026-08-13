// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

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
        // Only reached in tests that render the real StatusAslan (it does
        // its own count queries against these) -- unused otherwise.
        if (table === "assistant_memories") return chainable([]);
        if (table === "assistant_audit_log") return chainable([]);
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

function mockStatusAslan() {
  vi.doMock("@/components/asisten/StatusAslan", () => ({ default: () => <div>StatusAslan</div> }));
}

function mockRouter() {
  const push = vi.fn();
  vi.doMock("next/navigation", () => ({ useRouter: () => ({ push }) }));
  return { push };
}

type VoiceMock = {
  supported?: boolean;
  model?: string;
  setModel?: (m: string) => void;
};

// The Aslan page only reads `supported`/`model`/`setModel` off the hook now --
// the mic/hands-free/screen-share controls moved to the Memory Map, which
// has its own tests exercising the rest of useVoiceAssistant's surface.
function mockVoice({ supported = true, model = "claude-sonnet-5", setModel = vi.fn() }: VoiceMock = {}) {
  vi.doMock("@/lib/assistant/useVoiceAssistant", () => ({
    useVoiceAssistant: () => ({
      supported,
      model,
      setModel,
    }),
  }));
  return { setModel };
}

function mockFetchRouter({
  chatReply,
  captureChatBody,
}: {
  chatReply?: string;
  captureChatBody?: (body: Record<string, unknown>) => void;
} = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
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
  // Runs first and deliberately never calls mockStatusAslan() -- vi.doMock
  // registrations outlive resetModules() within a file, so once any later
  // test mocks StatusAslan it'd stay mocked for the rest of the run. Being
  // first means this is the only test where the real component is ever
  // resolved, proving the actual navigation wiring: AI Core split off into
  // its own page/route, so "Kelola" now navigates instead of toggling a
  // section on this same page.
  it("navigates to the AI Core page when StatusAslan's manage button is clicked", async () => {
    mockSupabase([]);
    mockVoice();
    const { push } = mockRouter();
    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    fireEvent.click(await screen.findByText(/Kelola/));
    expect(push).toHaveBeenCalledWith("/dashboard/ai-core");
  });

  it("loads and shows past chat history", async () => {
    mockSupabase([
      { id: "1", user_id: "user-1", role: "user", content: "halo", created_at: new Date().toISOString() },
      { id: "2", user_id: "user-1", role: "assistant", content: "Halo balik!", created_at: new Date().toISOString() },
    ]);
    mockVoice();
    mockStatusAslan();
    mockRouter();
    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    expect(await screen.findByText("Halo balik!")).toBeInTheDocument();
  });

  it("sends a typed message and streams the reply", async () => {
    mockSupabase([]);
    mockVoice();
    mockStatusAslan();
    mockRouter();
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

  it("shows the active model selected in the dropdown and calls setModel when a different one is picked", async () => {
    mockSupabase([]);
    const { setModel } = mockVoice({ model: "claude-sonnet-5" });
    mockStatusAslan();
    mockRouter();
    mockFetchRouter();

    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    const select = await screen.findByRole("combobox");
    expect(select).toHaveValue("claude-sonnet-5");

    fireEvent.change(select, { target: { value: "claude-opus-5" } });
    expect(setModel).toHaveBeenCalledWith("claude-opus-5");
  });

  it("sends the active model in the chat request body", async () => {
    mockSupabase([]);
    mockVoice({ model: "claude-haiku-4-5" });
    mockStatusAslan();
    mockRouter();
    const captured: Record<string, unknown>[] = [];
    mockFetchRouter({ captureChatBody: (body) => captured.push(body) });

    const { default: AsistenPage } = await import("./page");
    render(<AsistenPage />);

    const input = await screen.findByPlaceholderText("Tanya atau minta dicatetin sesuatu...");
    fireEvent.change(input, { target: { value: "cari tren terkini" } });
    fireEvent.click(screen.getByText("Kirim"));

    await screen.findByText("ok");
    expect(captured[0]).toMatchObject({ model: "claude-haiku-4-5" });
  });

  it("renders a short assistant reply as a plain bubble with no pagination chrome", async () => {
    mockSupabase([
      { id: "1", user_id: "user-1", role: "assistant", content: "Oke, siap!", created_at: new Date().toISOString() },
    ]);
    mockVoice();
    mockStatusAslan();
    mockRouter();
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
    mockStatusAslan();
    mockRouter();
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
