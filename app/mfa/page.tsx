"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import HudPanel from "@/components/HudPanel";
import { inputClass, primaryBtnClass, ghostBtnClass } from "@/lib/ui";

export default function MfaChallengePage() {
  const router = useRouter();
  const supabase = createClient();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error || !data?.totp?.[0]) {
        setError("Nggak nemu metode 2FA yang aktif. Coba login ulang.");
        setLoading(false);
        return;
      }
      setFactorId(data.totp[0].id);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || code.trim().length !== 6) return;
    setVerifying(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setVerifying(false);
    if (error) {
      setError("Kode salah atau kadaluarsa. Coba lagi.");
      setCode("");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    if (!recoveryCode.trim()) return;
    setRecovering(true);
    setError(null);
    try {
      const res = await fetch("/api/mfa/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: recoveryCode.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal pulihkan akun.");
        setRecovering(false);
        return;
      }
      await supabase.auth.signOut();
      router.push("/login?notice=" + encodeURIComponent("2FA dimatiin pake recovery code. Login lagi pake password, terus setup 2FA baru kalau mau."));
    } catch {
      setError("Gagal pulihkan akun. Coba lagi.");
      setRecovering(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-2xl font-bold tracking-wide text-fg">
            {mode === "totp" ? "Verifikasi 2FA" : "Pulihkan Akses"}
          </h1>
          <p id="mfa-code-hint" className="text-fg-subtle text-sm mt-1 font-body">
            {mode === "totp"
              ? "Masukin kode 6 digit dari aplikasi authenticator kamu"
              : "Masukin salah satu recovery code yang kamu simpen pas aktifin 2FA"}
          </p>
        </div>

        <HudPanel glow>
          {loading ? (
            <p className="text-sm text-fg-subtle text-center">Memuat...</p>
          ) : mode === "totp" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                aria-label="Kode verifikasi 6 digit"
                aria-describedby="mfa-code-hint"
                className={`${inputClass} text-center text-2xl tracking-[0.5em] font-mono`}
                placeholder="000000"
              />
              {error && (
                <p className="text-rose-glow text-xs font-mono border border-rose-glow/30 bg-rose-glow/5 rounded-sm px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={verifying || !factorId || code.trim().length !== 6}
                className={`w-full ${primaryBtnClass} py-2.5 text-sm`}
              >
                {verifying ? "Verifikasi..." : "Verifikasi"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("recovery");
                  setError(null);
                }}
                className={`w-full ${ghostBtnClass} py-2.5 text-sm text-center`}
              >
                Kehilangan akses ke authenticator? Pakai recovery code
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full text-fg-subtle hover:text-fg-muted text-xs font-mono text-center"
              >
                Bukan kamu? Keluar
              </button>
            </form>
          ) : (
            <form onSubmit={handleRecover} className="space-y-4">
              <input
                type="text"
                autoFocus
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                aria-label="Recovery code"
                className={`${inputClass} text-center text-lg tracking-[0.15em] font-mono`}
                placeholder="XXXXX-XXXXX"
              />
              <p className="text-[11px] text-fg-subtle">
                Ini matiin 2FA di akun kamu (sekali pakai) — kamu bisa login pake password aja abis ini,
                terus setup 2FA baru kapan aja.
              </p>
              {error && (
                <p className="text-rose-glow text-xs font-mono border border-rose-glow/30 bg-rose-glow/5 rounded-sm px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={recovering || !recoveryCode.trim()}
                className={`w-full ${primaryBtnClass} py-2.5 text-sm`}
              >
                {recovering ? "Memulihkan..." : "Pulihkan & Matikan 2FA"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("totp");
                  setError(null);
                }}
                className={`w-full ${ghostBtnClass} py-2.5 text-sm text-center`}
              >
                Balik ke kode authenticator
              </button>
            </form>
          )}
        </HudPanel>
      </div>
    </main>
  );
}
