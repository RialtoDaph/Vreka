"use client";

import { useEffect, useState } from "react";

type Prefs = {
  pushDailyDigest: boolean;
  pushBudgetAlerts: boolean;
  telegramDailyBriefing: boolean;
};

const DEFAULT_PREFS: Prefs = {
  pushDailyDigest: true,
  pushBudgetAlerts: true,
  telegramDailyBriefing: true,
};

const ROWS: { key: keyof Prefs; label: string; detail: string }[] = [
  { key: "pushDailyDigest", label: "Ringkasan pagi (push)", detail: "Saldo, tugas due, dan kebiasaan tiap pagi." },
  { key: "pushBudgetAlerts", label: "Alert anggaran (push)", detail: "Instan pas kategori nyaris atau kebobolan." },
  {
    key: "telegramDailyBriefing",
    label: "Ringkasan pagi (Telegram)",
    detail: "Isinya sama kaya push, dikirim ke Telegram.",
  },
];

function ToggleSwitch({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full border shrink-0 transition-colors disabled:opacity-50 ${
        on ? "bg-mint-glow/20 border-mint-glow/60" : "bg-panel2 border-line"
      }`}
    >
      <span
        className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-transform ${
          on ? "translate-x-[18px] bg-mint-glow" : "translate-x-0.5 bg-slate-500"
        }`}
      />
    </button>
  );
}

// Category-level on/off for Aslan's notification channels -- previously
// push was all-or-nothing (subscribe = get everything) and the Telegram
// morning briefing had no opt-out at all.
export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/notification-preferences");
        const data = await res.json();
        if (data.preferences) setPrefs(data.preferences);
      } catch {
        // keep defaults -- the toggles just won't reflect a saved override.
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleToggle(key: keyof Prefs) {
    const prev = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    setError(null);
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next[key] }),
      });
      if (!res.ok) {
        setPrefs(prev);
        setError("Gagal simpan preferensi.");
      }
    } catch {
      setPrefs(prev);
      setError("Gagal simpan preferensi.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2.5">
        Preferensi Notifikasi
      </p>
      {loading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : (
        <div className="space-y-3">
          {ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-slate-200">{row.label}</p>
                <p className="text-[11px] text-slate-400">{row.detail}</p>
              </div>
              <ToggleSwitch
                on={prefs[row.key]}
                onChange={() => handleToggle(row.key)}
                label={row.label}
                disabled={saving === row.key}
              />
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-rose-glow mt-2">{error}</p>}
    </div>
  );
}
