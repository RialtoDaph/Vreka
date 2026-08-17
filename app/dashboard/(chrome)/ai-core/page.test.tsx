// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/dashboard/ai-core");
});

// These each do their own Supabase/fetch calls on mount -- stubbed out so
// this test only exercises the page's own stat cells + integration wiring.
vi.mock("@/components/asisten/ActivityLog", () => ({ default: () => <div>ActivityLog</div> }));
vi.mock("@/components/asisten/DataExport", () => ({ default: () => <div>DataExport</div> }));
vi.mock("@/components/asisten/GmailDrafts", () => ({ default: () => <div>GmailDrafts</div> }));
vi.mock("@/components/asisten/PushNotifications", () => ({ default: () => <div>PushNotifications</div> }));
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

type ChangeHandler = (payload: { new: Record<string, unknown> }) => void;

function mockSupabase({
  gmailEmail = null as string | null,
  telegramUsername = null as string | null,
  memCount = 0,
  actionCount = 0,
  msgCount = 0,
} = {}) {
  const channels: { handler: ChangeHandler }[] = [];
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      from: (table: string) => {
        if (table === "google_credentials") return chainable(gmailEmail ? [{ email_address: gmailEmail }] : []);
        if (table === "telegram_links")
          return chainable(
            telegramUsername ? [{ telegram_username: telegramUsername, linked_at: "2026-01-01" }] : []
          );
        if (table === "assistant_memories") return chainable(Array(memCount).fill({}));
        if (table === "assistant_audit_log") return chainable(Array(actionCount).fill({}));
        if (table === "assistant_messages") return chainable(Array(msgCount).fill({}));
        throw new Error(`unexpected table: ${table}`);
      },
      channel: () => {
        const entry: { handler: ChangeHandler } = { handler: () => {} };
        channels.push(entry);
        const chan = {
          on: (_event: string, _filter: unknown, handler: ChangeHandler) => {
            entry.handler = handler;
            return chan;
          },
          subscribe: () => chan,
        };
        return chan;
      },
      removeChannel: () => {},
    }),
  }));
  return {
    emitTelegramLinked: (row: Record<string, unknown>) => {
      for (const c of channels) c.handler({ new: row });
    },
  };
}

function mockVoice(supported = true) {
  vi.doMock("@/lib/assistant/useVoiceAssistant", () => ({
    useVoiceAssistant: () => ({ supported }),
  }));
}

describe("AiCorePage", () => {
  it("shows Gmail and Telegram as disconnected, with real stat counts", async () => {
    mockSupabase({ memCount: 4, actionCount: 2, msgCount: 10 });
    mockVoice(true);
    const { default: AiCorePage } = await import("./page");
    render(<AiCorePage />);

    expect(await screen.findByText("Aslan belum bisa cek email atau kalender kamu.")).toBeInTheDocument();
    expect(screen.getByText("Chat Aslan langsung dari Telegram.")).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument(); // model + voice, no Gmail/Telegram
    expect(screen.getByText("4")).toBeInTheDocument(); // memori
    expect(screen.getByText("2")).toBeInTheDocument(); // aksi hari ini
    expect(screen.getByText("10")).toBeInTheDocument(); // total obrolan
  });

  it("shows Gmail connected and disconnects it when Unlink is clicked", async () => {
    mockSupabase({ gmailEmail: "user@gmail.com" });
    mockVoice(true);
    const { default: AiCorePage } = await import("./page");
    render(<AiCorePage />);

    expect(await screen.findByText("user@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("GmailDrafts")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Unlink"));
    await waitFor(() =>
      expect(screen.getByText("Aslan belum bisa cek email atau kalender kamu.")).toBeInTheDocument()
    );
  });

  it("shows Telegram connected with its username", async () => {
    mockSupabase({ telegramUsername: "budi123" });
    mockVoice(true);
    const { default: AiCorePage } = await import("./page");
    render(<AiCorePage />);

    expect(await screen.findByText("@budi123")).toBeInTheDocument();
  });

  it("shows a success notice from the OAuth redirect and clears it from the URL", async () => {
    window.history.replaceState(null, "", "/dashboard/ai-core?gmail=connected");
    mockSupabase();
    mockVoice(true);
    const { default: AiCorePage } = await import("./page");
    render(<AiCorePage />);

    expect(await screen.findByText("Gmail berhasil terhubung.")).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("shows an error notice from a failed OAuth redirect", async () => {
    window.history.replaceState(null, "", "/dashboard/ai-core?gmail_error=State%20nggak%20cocok");
    mockSupabase();
    mockVoice(true);
    const { default: AiCorePage } = await import("./page");
    render(<AiCorePage />);

    expect(await screen.findByText(/Gagal connect Gmail: State nggak cocok/)).toBeInTheDocument();
  });

  it("renders the activity log, data export, and 2FA sections", async () => {
    mockSupabase();
    mockVoice(true);
    const { default: AiCorePage } = await import("./page");
    render(<AiCorePage />);

    expect(await screen.findByText("ActivityLog")).toBeInTheDocument();
    expect(screen.getByText("DataExport")).toBeInTheDocument();
    expect(screen.getByText("TwoFactorAuth")).toBeInTheDocument();
  });

  it("connects Telegram the instant the Realtime link-confirmation event arrives, no poll needed", async () => {
    const { emitTelegramLinked } = mockSupabase();
    mockVoice(true);
    vi.stubGlobal("open", vi.fn());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ deepLink: "https://t.me/aslan_bot?start=abc123" }),
      }))
    );
    const { default: AiCorePage } = await import("./page");
    render(<AiCorePage />);

    await screen.findByText("Chat Aslan langsung dari Telegram.");
    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(await screen.findByText(/Buka Telegram, tekan Start/)).toBeInTheDocument();

    emitTelegramLinked({ telegram_username: "budi123", linked_at: "2026-08-17T00:00:00.000Z" });

    expect(await screen.findByText("@budi123")).toBeInTheDocument();
  });
});
