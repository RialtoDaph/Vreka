// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

function mockSupabase({
  factors = [],
  enrollResult = { data: { id: "f1", totp: { qr_code: "data:image/svg+xml;base64,abc", secret: "SECRET123" } }, error: null },
  verifyResult = { data: {}, error: null },
  unenrollResult = { data: {}, error: null },
}: {
  factors?: Array<{ id: string; status: string }>;
  enrollResult?: { data: unknown; error: unknown };
  verifyResult?: { data: unknown; error: unknown };
  unenrollResult?: { data: unknown; error: unknown };
}) {
  const enroll = vi.fn().mockResolvedValue(enrollResult);
  const challengeAndVerify = vi.fn().mockResolvedValue(verifyResult);
  const unenroll = vi.fn().mockResolvedValue(unenrollResult);
  const insertedCodes: unknown[] = [];
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
        mfa: {
          listFactors: vi.fn().mockResolvedValue({ data: { totp: factors }, error: null }),
          enroll,
          challengeAndVerify,
          unenroll,
        },
      },
      from: (table: string) => ({
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        insert: (rows: unknown[]) => {
          if (table === "mfa_recovery_codes") insertedCodes.push(...rows);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }));
  return { enroll, challengeAndVerify, unenroll, insertedCodes };
}

describe("TwoFactorAuth", () => {
  it("shows the activate button when no factor is verified", async () => {
    mockSupabase({ factors: [] });
    const { default: TwoFactorAuth } = await import("./TwoFactorAuth");
    render(<TwoFactorAuth />);
    expect(await screen.findByText("Aktifkan 2FA")).toBeInTheDocument();
  });

  it("shows the disable button when a verified factor already exists", async () => {
    mockSupabase({ factors: [{ id: "f1", status: "verified" }] });
    const { default: TwoFactorAuth } = await import("./TwoFactorAuth");
    render(<TwoFactorAuth />);
    expect(await screen.findByText("Matikan 2FA")).toBeInTheDocument();
    expect(screen.getByText(/butuh kode dari aplikasi authenticator/)).toBeInTheDocument();
  });

  it("ignores an unverified (in-progress) factor — still treated as not enrolled", async () => {
    mockSupabase({ factors: [{ id: "f1", status: "unverified" }] });
    const { default: TwoFactorAuth } = await import("./TwoFactorAuth");
    render(<TwoFactorAuth />);
    expect(await screen.findByText("Aktifkan 2FA")).toBeInTheDocument();
  });

  it("starts enrollment and shows the QR code + manual secret", async () => {
    mockSupabase({ factors: [] });
    const { default: TwoFactorAuth } = await import("./TwoFactorAuth");
    render(<TwoFactorAuth />);

    fireEvent.click(await screen.findByText("Aktifkan 2FA"));

    expect(await screen.findByAltText("QR code 2FA")).toBeInTheDocument();
    expect(screen.getByText("SECRET123")).toBeInTheDocument();
  });

  it("verifies the code and flips to the active state", async () => {
    const { challengeAndVerify } = mockSupabase({ factors: [] });
    const { default: TwoFactorAuth } = await import("./TwoFactorAuth");
    render(<TwoFactorAuth />);

    fireEvent.click(await screen.findByText("Aktifkan 2FA"));
    await screen.findByAltText("QR code 2FA");

    const codeInput = screen.getByPlaceholderText("000000");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByText("Verifikasi"));

    expect(await screen.findByText("Matikan 2FA")).toBeInTheDocument();
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "123456" });
  });

  it("shows an error and stays in enrollment state on a wrong code", async () => {
    mockSupabase({
      factors: [],
      verifyResult: { data: null, error: { message: "Invalid code" } },
    });
    const { default: TwoFactorAuth } = await import("./TwoFactorAuth");
    render(<TwoFactorAuth />);

    fireEvent.click(await screen.findByText("Aktifkan 2FA"));
    await screen.findByAltText("QR code 2FA");

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "000000" } });
    fireEvent.click(screen.getByText("Verifikasi"));

    expect(await screen.findByText("Kode salah. Coba lagi.")).toBeInTheDocument();
    expect(screen.getByAltText("QR code 2FA")).toBeInTheDocument();
  });

  it("unenrolls when disabling an active factor", async () => {
    const { unenroll } = mockSupabase({ factors: [{ id: "f1", status: "verified" }] });
    const { default: TwoFactorAuth } = await import("./TwoFactorAuth");
    render(<TwoFactorAuth />);

    fireEvent.click(await screen.findByText("Matikan 2FA"));

    expect(unenroll).toHaveBeenCalledWith({ factorId: "f1" });
    expect(await screen.findByText("Aktifkan 2FA")).toBeInTheDocument();
  });

  it("generates and shows 10 recovery codes right after enabling 2FA", async () => {
    const { insertedCodes } = mockSupabase({ factors: [] });
    const { default: TwoFactorAuth } = await import("./TwoFactorAuth");
    render(<TwoFactorAuth />);

    fireEvent.click(await screen.findByText("Aktifkan 2FA"));
    await screen.findByAltText("QR code 2FA");
    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByText("Verifikasi"));

    expect(await screen.findByText(/Simpen recovery codes ini sekarang/)).toBeInTheDocument();
    expect(insertedCodes).toHaveLength(10);
    // Dismissing just hides the panel -- the codes stay stored.
    fireEvent.click(screen.getByText("Udah disimpen"));
    expect(screen.queryByText(/Simpen recovery codes ini sekarang/)).not.toBeInTheDocument();
  });

  it("regenerates recovery codes on demand, replacing any existing batch", async () => {
    const { insertedCodes } = mockSupabase({ factors: [{ id: "f1", status: "verified" }] });
    const { default: TwoFactorAuth } = await import("./TwoFactorAuth");
    render(<TwoFactorAuth />);

    fireEvent.click(await screen.findByText("Bikin ulang recovery codes"));

    expect(await screen.findByText(/Simpen recovery codes ini sekarang/)).toBeInTheDocument();
    expect(insertedCodes).toHaveLength(10);
  });

  it("clears the recovery-codes panel when 2FA is disabled", async () => {
    mockSupabase({ factors: [{ id: "f1", status: "verified" }] });
    const { default: TwoFactorAuth } = await import("./TwoFactorAuth");
    render(<TwoFactorAuth />);

    fireEvent.click(await screen.findByText("Bikin ulang recovery codes"));
    await screen.findByText(/Simpen recovery codes ini sekarang/);

    fireEvent.click(screen.getByText("Matikan 2FA"));

    await waitFor(() =>
      expect(screen.queryByText(/Simpen recovery codes ini sekarang/)).not.toBeInTheDocument()
    );
  });
});
