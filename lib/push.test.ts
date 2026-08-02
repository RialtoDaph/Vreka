import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function fakeSupabase(subs: unknown[]) {
  const deleted: string[] = [];
  return {
    client: {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: subs, error: null }),
        }),
        delete: () => ({
          eq: (_col: string, id: string) => {
            deleted.push(id);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    },
    deleted,
  };
}

beforeEach(() => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("sendPushToUser", () => {
  it("does nothing and sends nothing when VAPID env vars aren't configured", async () => {
    vi.unstubAllEnvs();
    const sendNotification = vi.fn();
    vi.doMock("web-push", () => ({
      default: { setVapidDetails: vi.fn(), sendNotification },
    }));
    const { sendPushToUser } = await import("./push");
    const { client } = fakeSupabase([{ id: "s1", endpoint: "e1", p256dh: "p", auth: "a" }]);

    const result = await sendPushToUser(client as never, "user-1", { title: "T", body: "B" });

    expect(result).toEqual({ sent: 0, removed: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends a notification to every subscription and counts successes", async () => {
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    vi.doMock("web-push", () => ({
      default: { setVapidDetails: vi.fn(), sendNotification },
    }));
    const { sendPushToUser } = await import("./push");
    const { client } = fakeSupabase([
      { id: "s1", endpoint: "e1", p256dh: "p1", auth: "a1" },
      { id: "s2", endpoint: "e2", p256dh: "p2", auth: "a2" },
    ]);

    const result = await sendPushToUser(client as never, "user-1", { title: "T", body: "B" });

    expect(result).toEqual({ sent: 2, removed: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("removes a subscription that reports 410 Gone instead of retrying forever", async () => {
    const sendNotification = vi.fn().mockRejectedValue({ statusCode: 410 });
    vi.doMock("web-push", () => ({
      default: { setVapidDetails: vi.fn(), sendNotification },
    }));
    const { sendPushToUser } = await import("./push");
    const { client, deleted } = fakeSupabase([{ id: "s1", endpoint: "e1", p256dh: "p", auth: "a" }]);

    const result = await sendPushToUser(client as never, "user-1", { title: "T", body: "B" });

    expect(result).toEqual({ sent: 0, removed: 1 });
    expect(deleted).toEqual(["s1"]);
  });

  it("leaves a subscription alone on a transient (non-410/404) error", async () => {
    const sendNotification = vi.fn().mockRejectedValue({ statusCode: 500 });
    vi.doMock("web-push", () => ({
      default: { setVapidDetails: vi.fn(), sendNotification },
    }));
    const { sendPushToUser } = await import("./push");
    const { client, deleted } = fakeSupabase([{ id: "s1", endpoint: "e1", p256dh: "p", auth: "a" }]);

    const result = await sendPushToUser(client as never, "user-1", { title: "T", body: "B" });

    expect(result).toEqual({ sent: 0, removed: 0 });
    expect(deleted).toEqual([]);
  });
});
