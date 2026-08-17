"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useQueryParamNotice } from "@/lib/useQueryParamNotice";
import HudPanel from "@/components/HudPanel";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // /auth/callback bounces its failures back here as ?error=, and
  // /mfa's recovery-code flow bounces back here as ?notice= after
  // disabling 2FA.
  useQueryParamNotice(["error", "notice"], (params) => {
    const reason = params.get("error");
    const note = params.get("notice");
    if (reason) setError(reason);
    if (note) setNotice(note);
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Without this the link falls back to the project's Site URL, which
          // is what sends confirmation emails to localhost.
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      setNotice("Akun dibuat. Klik link konfirmasi di email kamu — nanti langsung masuk sendiri.");
      setMode("signin");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-cyan-glow pulse-dot" />
            <span className="text-xs tracking-[0.3em] text-cyan-glow font-mono uppercase">
              System Online
            </span>
          </div>
          <h1 className="font-display text-4xl font-bold tracking-wide text-fg">
            VREKA
          </h1>
          <p className="text-fg-subtle text-sm mt-1 font-body">
            Command center pribadi kamu
          </p>
        </div>

        <HudPanel glow>
          <div className="flex mb-5 border border-line rounded-sm overflow-hidden text-sm font-mono">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 uppercase tracking-wider transition-colors ${
                mode === "signin"
                  ? "bg-cyan-glow/10 text-cyan-glow"
                  : "text-fg-subtle hover:text-fg-muted"
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 uppercase tracking-wider transition-colors ${
                mode === "signup"
                  ? "bg-cyan-glow/10 text-cyan-glow"
                  : "text-fg-subtle hover:text-fg-muted"
              }`}
            >
              Daftar
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-mono uppercase tracking-wider text-fg-subtle mb-1.5"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-panel2 border border-line rounded-sm px-3 py-2.5 text-sm text-fg placeholder:text-slate-600 focus:border-cyan-glow/60 transition-colors"
                placeholder="kamu@email.com"
              />
            </div>
            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-mono uppercase tracking-wider text-fg-subtle mb-1.5"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-panel2 border border-line rounded-sm px-3 py-2.5 text-sm text-fg placeholder:text-slate-600 focus:border-cyan-glow/60 transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-rose-glow text-xs font-mono border border-rose-glow/30 bg-rose-glow/5 rounded-sm px-3 py-2">
                {error}
              </p>
            )}
            {notice && (
              <p className="text-mint-glow text-xs font-mono border border-mint-glow/30 bg-mint-glow/5 rounded-sm px-3 py-2">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-glow/10 hover:bg-cyan-glow/20 border border-cyan-glow/50 text-cyan-glow font-mono uppercase tracking-wider text-sm py-2.5 rounded-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Memproses..." : mode === "signin" ? "Masuk" : "Buat Akun"}
            </button>
          </form>
        </HudPanel>
      </div>
    </main>
  );
}
