// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import NotificationPreferences from "./NotificationPreferences";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch(opts: {
  preferences?: Record<string, boolean>;
  patchOk?: boolean;
} = {}) {
  const patchCalls: Record<string, boolean>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patchCalls.push(JSON.parse(String(init.body)));
        return Promise.resolve({ ok: opts.patchOk ?? true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          preferences: opts.preferences ?? {
            pushDailyDigest: true,
            pushBudgetAlerts: true,
            telegramDailyBriefing: true,
          },
        }),
      });
    })
  );
  return patchCalls;
}

describe("NotificationPreferences", () => {
  it("shows all three toggles on by default", async () => {
    stubFetch();
    render(<NotificationPreferences />);

    expect(await screen.findByLabelText("Ringkasan pagi (push)")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Alert anggaran (push)")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Ringkasan pagi (Telegram)")).toHaveAttribute("aria-checked", "true");
  });

  it("reflects a stored preference that's turned off", async () => {
    stubFetch({
      preferences: { pushDailyDigest: false, pushBudgetAlerts: true, telegramDailyBriefing: true },
    });
    render(<NotificationPreferences />);

    expect(await screen.findByLabelText("Ringkasan pagi (push)")).toHaveAttribute("aria-checked", "false");
  });

  it("toggling a switch flips it and PATCHes just that field", async () => {
    const patchCalls = stubFetch();
    render(<NotificationPreferences />);

    const toggle = await screen.findByLabelText("Alert anggaran (push)");
    fireEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(patchCalls).toEqual([{ pushBudgetAlerts: false }]);
  });

  it("reverts the toggle and shows an error when saving fails", async () => {
    stubFetch({ patchOk: false });
    render(<NotificationPreferences />);

    const toggle = await screen.findByLabelText("Ringkasan pagi (Telegram)");
    fireEvent.click(toggle);

    await screen.findByText("Gagal simpan preferensi.");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});
