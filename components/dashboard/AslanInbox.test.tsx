// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const LAST_SEEN_KEY = "aslan-inbox-last-seen";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
  window.localStorage.clear();
});

// Records channel subscriptions so a test can simulate a Realtime INSERT by
// calling the handler directly, the same shape supabase-js hands it a
// `{ new: <row> }` payload.
type ChangeHandler = (payload: { new: Record<string, unknown> }) => void;

function mockAuditRows(rows: Record<string, unknown>[]) {
  const channels: { handler: ChangeHandler }[] = [];
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: (table: string) => {
        if (table !== "assistant_audit_log") throw new Error(`unexpected table: ${table}`);
        const obj = {
          select: () => obj,
          gt: () => obj,
          order: () => obj,
          limit: () => Promise.resolve({ data: rows, error: null }),
        };
        return obj;
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
    emitInsert: (row: Record<string, unknown>) => {
      for (const c of channels) c.handler({ new: row });
    },
  };
}

describe("AslanInbox", () => {
  it("renders nothing and just sets the cursor on a first-ever visit", async () => {
    mockAuditRows([]);
    const { default: AslanInbox } = await import("./AslanInbox");
    const { container } = render(<AslanInbox />);

    await waitFor(() => expect(window.localStorage.getItem(LAST_SEEN_KEY)).not.toBeNull());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows tool-run entries newer than the last-seen cursor, with a count badge", async () => {
    window.localStorage.setItem(LAST_SEEN_KEY, "2020-01-01T00:00:00.000Z");
    mockAuditRows([
      {
        id: "a1",
        tool_name: "check_calendar",
        input: {},
        result_ok: true,
        created_at: "2026-08-08T09:00:00.000Z",
      },
    ]);
    const { default: AslanInbox } = await import("./AslanInbox");
    render(<AslanInbox />);

    expect(await screen.findByText("Aslan · Inbox")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/Cek kalender/)).toBeInTheDocument();
    expect(screen.getByText(/via google calendar/)).toBeInTheDocument();
  });

  it("tags a failed tool run", async () => {
    window.localStorage.setItem(LAST_SEEN_KEY, "2020-01-01T00:00:00.000Z");
    mockAuditRows([
      {
        id: "a1",
        tool_name: "add_task",
        input: {},
        result_ok: false,
        created_at: "2026-08-08T09:00:00.000Z",
      },
    ]);
    const { default: AslanInbox } = await import("./AslanInbox");
    render(<AslanInbox />);

    expect(await screen.findByText(/gagal/)).toBeInTheDocument();
  });

  it("dismissing advances the cursor and hides the card", async () => {
    window.localStorage.setItem(LAST_SEEN_KEY, "2020-01-01T00:00:00.000Z");
    mockAuditRows([
      {
        id: "a1",
        tool_name: "add_task",
        input: { title: "Bayar listrik" },
        result_ok: true,
        created_at: "2026-08-08T09:00:00.000Z",
      },
    ]);
    const { default: AslanInbox } = await import("./AslanInbox");
    const { container } = render(<AslanInbox />);

    fireEvent.click(await screen.findByText("Oke, siap"));

    expect(container).toBeEmptyDOMElement();
    expect(window.localStorage.getItem(LAST_SEEN_KEY)).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("shows a new tool run the instant its Realtime insert event arrives, no poll needed", async () => {
    window.localStorage.setItem(LAST_SEEN_KEY, "2020-01-01T00:00:00.000Z");
    const { emitInsert } = mockAuditRows([]);
    const { default: AslanInbox } = await import("./AslanInbox");
    const { container } = render(<AslanInbox />);

    // Nothing pending yet -- the initial catch-up fetch returned no rows.
    await waitFor(() => expect(container).toBeEmptyDOMElement());

    emitInsert({
      id: "a2",
      tool_name: "add_transaction",
      input: {},
      result_ok: true,
      created_at: "2026-08-08T10:00:00.000Z",
    });

    expect(await screen.findByText("Aslan · Inbox")).toBeInTheDocument();
    expect(screen.getByText(/Nyatetin transaksi/)).toBeInTheDocument();
  });
});
