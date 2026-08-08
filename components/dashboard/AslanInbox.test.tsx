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

function mockAuditRows(rows: Record<string, unknown>[]) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
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
    }),
  }));
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
});
