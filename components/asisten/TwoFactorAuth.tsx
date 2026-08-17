"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputClass, primaryBtnClass, ghostBtnClass, dangerBtnClass } from "@/lib/ui";
import { RECOVERY_CODE_COUNT, generateRecoveryCode, hashRecoveryCode } from "@/lib/mfaRecovery";

type EnrollState = {
  factorId: string;
  qrCode: string;
  secret: string;
} | null;

export default function TwoFactorAuth() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [activeFactorId, setActiveFactorId] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<EnrollState>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  async function loadFactors() {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp?.find((f) => f.status === "verified");
    setActiveFactorId(verified?.id ?? null);
    setLoading(false);
  }

  useEffect(() => {
    loadFactors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStartEnroll() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (error || !data) {
      setError(error?.message ?? "Gagal mulai setup 2FA.");
      return;
    }
    setEnroll({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  }

  // Overwrites any existing codes -- old ones (from a previous enroll or an
  // earlier "regenerate") stop working the moment new ones are generated,
  // so there's never more than one valid batch outstanding.
  async function generateAndStoreRecoveryCodes() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
    const hashes = await Promise.all(codes.map(hashRecoveryCode));
    await supabase.from("mfa_recovery_codes").delete().eq("user_id", user.id);
    const { error: insertError } = await supabase
      .from("mfa_recovery_codes")
      .insert(hashes.map((code_hash) => ({ user_id: user.id, code_hash })));
    if (insertError) {
      setError("2FA aktif, tapi gagal bikin recovery codes. Coba \"Bikin ulang recovery codes\" di bawah.");
      return;
    }
    setRecoveryCodes(codes);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll || code.trim().length !== 6) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enroll.factorId,
      code: code.trim(),
    });
    if (error) {
      setBusy(false);
      setError("Kode salah. Coba lagi.");
      setCode("");
      return;
    }
    setEnroll(null);
    setCode("");
    setActiveFactorId(enroll.factorId);
    await generateAndStoreRecoveryCodes();
    setBusy(false);
  }

  async function handleRegenerateRecoveryCodes() {
    setRegenerating(true);
    setError(null);
    await generateAndStoreRecoveryCodes();
    setRegenerating(false);
  }

  async function handleCancelEnroll() {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.factorId });
    setEnroll(null);
    setCode("");
    setError(null);
  }

  async function handleDisable() {
    if (!activeFactorId) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: activeFactorId });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("mfa_recovery_codes").delete().eq("user_id", user.id);
    setActiveFactorId(null);
    setRecoveryCodes(null);
    setBusy(false);
  }

  if (loading) {
    return <p className="text-sm text-fg-subtle">Memuat...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] font-mono uppercase tracking-wider text-fg-subtle mb-0.5">
            Autentikasi Dua Faktor (2FA)
          </p>
          <p className="text-fg-muted text-sm">
            {activeFactorId
              ? "Aktif — login butuh kode dari aplikasi authenticator."
              : enroll
                ? "Scan QR code-nya, lalu masukin kode buat aktifin."
                : "Nonaktif — nambah lapisan keamanan pas login."}
          </p>
        </div>
        {activeFactorId && !enroll && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleRegenerateRecoveryCodes} disabled={busy || regenerating} className={ghostBtnClass}>
              {regenerating ? "Bikin ulang..." : "Bikin ulang recovery codes"}
            </button>
            <button onClick={handleDisable} disabled={busy} className={dangerBtnClass}>
              Matikan 2FA
            </button>
          </div>
        )}
        {!activeFactorId && !enroll && (
          <button onClick={handleStartEnroll} disabled={busy} className={primaryBtnClass}>
            {busy ? "Menyiapkan..." : "Aktifkan 2FA"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-rose-glow mt-2">{error}</p>}

      {recoveryCodes && (
        <div className="mt-4 space-y-3 bg-panel2/60 border border-line rounded-sm p-3.5">
          <p className="text-xs text-fg-muted">
            <strong className="text-fg">Simpen recovery codes ini sekarang</strong> — cuma ditampilin
            sekali. Kalau HP/app authenticator kamu ilang, satu kode ini bisa dipake buat matiin 2FA lagi
            (kamu tetep login pake password, terus bisa setup 2FA baru).
          </p>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-xs text-cyan-glow bg-void/60 rounded-sm p-3">
            {recoveryCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n"))}
              className={ghostBtnClass}
            >
              Salin semua
            </button>
            <button type="button" onClick={() => setRecoveryCodes(null)} className={primaryBtnClass}>
              Udah disimpen
            </button>
          </div>
        </div>
      )}

      {enroll && (
        <div className="mt-4 space-y-3">
          <img src={enroll.qrCode} alt="QR code 2FA" className="w-40 h-40 bg-white rounded-sm p-1" />
          <p className="text-[11px] text-fg-subtle">
            Nggak bisa scan? Masukin manual di app authenticator kamu:{" "}
            <span className="font-mono text-fg-muted">{enroll.secret}</span>
          </p>
          <form onSubmit={handleVerify} className="flex flex-wrap gap-2 items-start">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`${inputClass} w-32 text-center tracking-[0.3em] font-mono`}
              placeholder="000000"
              autoFocus
            />
            <button type="submit" disabled={busy || code.trim().length !== 6} className={primaryBtnClass}>
              {busy ? "Verifikasi..." : "Verifikasi"}
            </button>
            <button type="button" onClick={handleCancelEnroll} className={ghostBtnClass}>
              Batal
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
