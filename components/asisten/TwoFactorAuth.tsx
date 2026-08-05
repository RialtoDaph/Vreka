"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputClass, primaryBtnClass, ghostBtnClass, dangerBtnClass } from "@/lib/ui";

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

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll || code.trim().length !== 6) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enroll.factorId,
      code: code.trim(),
    });
    setBusy(false);
    if (error) {
      setError("Kode salah. Coba lagi.");
      setCode("");
      return;
    }
    setEnroll(null);
    setCode("");
    setActiveFactorId(enroll.factorId);
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
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setActiveFactorId(null);
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Memuat...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-0.5">
            Autentikasi Dua Faktor (2FA)
          </p>
          <p className="text-slate-300 text-sm">
            {activeFactorId
              ? "Aktif — login butuh kode dari aplikasi authenticator."
              : enroll
                ? "Scan QR code-nya, lalu masukin kode buat aktifin."
                : "Nonaktif — nambah lapisan keamanan pas login."}
          </p>
        </div>
        {activeFactorId && !enroll && (
          <button onClick={handleDisable} disabled={busy} className={dangerBtnClass}>
            Matikan 2FA
          </button>
        )}
        {!activeFactorId && !enroll && (
          <button onClick={handleStartEnroll} disabled={busy} className={primaryBtnClass}>
            {busy ? "Menyiapkan..." : "Aktifkan 2FA"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-rose-glow mt-2">{error}</p>}

      {enroll && (
        <div className="mt-4 space-y-3">
          <img src={enroll.qrCode} alt="QR code 2FA" className="w-40 h-40 bg-white rounded-sm p-1" />
          <p className="text-[11px] text-slate-500">
            Nggak bisa scan? Masukin manual di app authenticator kamu:{" "}
            <span className="font-mono text-slate-300">{enroll.secret}</span>
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
