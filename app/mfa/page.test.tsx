// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  refresh.mockClear();
  vi.restoreAllMocks();
  vi.resetModules();
});

function mockSupabase({
  factors = [{ id: "f1" }],
  verifyResult = { data: {}, error: null },
}: {
  factors?: Array<{ id: string }>;
  verifyResult?: { data: unknown; error: unknown };
}) {
  const challengeAndVerify = vi.fn().mockResolvedValue(verifyResult);
  const signOut = vi.fn().mockResolvedValue({ error: null });
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: {
        mfa: {
          listFactors: vi.fn().mockResolvedValue({ data: { totp: factors }, error: null }),
          challengeAndVerify,
        },
        signOut,
      },
    }),
  }));
  return { challengeAndVerify, signOut };
}

describe("MfaChallengePage", () => {
  it("shows an error when there's no active factor to challenge", async () => {
    mockSupabase({ factors: [] });
    const { default: MfaChallengePage } = await import("./page");
    render(<MfaChallengePage />);
    expect(await screen.findByText(/Nggak nemu metode 2FA/)).toBeInTheDocument();
  });

  it("keeps Verifikasi disabled until a 6-digit code is entered", async () => {
    mockSupabase({});
    const { default: MfaChallengePage } = await import("./page");
    render(<MfaChallengePage />);

    const button = await screen.findByText("Verifikasi");
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123" } });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
    expect(button).not.toBeDisabled();
  });

  it("verifies the code and navigates to /dashboard on success", async () => {
    const { challengeAndVerify } = mockSupabase({});
    const { default: MfaChallengePage } = await import("./page");
    render(<MfaChallengePage />);

    fireEvent.change(await screen.findByPlaceholderText("000000"), { target: { value: "654321" } });
    fireEvent.click(screen.getByText("Verifikasi"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "654321" });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows an error and does not navigate on a wrong code", async () => {
    mockSupabase({ verifyResult: { data: null, error: { message: "bad code" } } });
    const { default: MfaChallengePage } = await import("./page");
    render(<MfaChallengePage />);

    fireEvent.change(await screen.findByPlaceholderText("000000"), { target: { value: "000000" } });
    fireEvent.click(screen.getByText("Verifikasi"));

    expect(await screen.findByText(/Kode salah atau kadaluarsa/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("signs out and returns to /login when the user isn't who's being challenged", async () => {
    const { signOut } = mockSupabase({});
    const { default: MfaChallengePage } = await import("./page");
    render(<MfaChallengePage />);

    fireEvent.click(await screen.findByText("Bukan kamu? Keluar"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(signOut).toHaveBeenCalled();
  });
});
