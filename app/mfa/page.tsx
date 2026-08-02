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

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-2xl font-bold tracking-wide text-white">
            Verifikasi 2FA
          </h1>
          <p className="text-slate-400 text-sm mt-1 font-body">
            Masukin kode 6 digit dari aplikasi authenticator kamu
          </p>
        </div>

        <HudPanel glow>
          {loading ? (
            <p className="text-sm text-slate-500 text-center">Memuat...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
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
                onClick={handleSignOut}
                className={`w-full ${ghostBtnClass} py-2.5 text-sm text-center`}
              >
                Bukan kamu? Keluar
              </button>
            </form>
          )}
        </HudPanel>
      </div>
    </main>
  );
}
