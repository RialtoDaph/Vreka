"use client";

import { useEffect, useState } from "react";
import { ghostBtnClass, dangerBtnClass, errorBannerClass } from "@/lib/ui";

type Draft = { id: string; to: string; subject: string; snippet: string };

// Aslan's draft_email_reply tool only ever creates a draft -- this is the
// one place a draft actually gets sent, and it's a deliberate click here,
// never something a tool call does on its own.
export default function GmailDrafts() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/google/gmail/drafts");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal ambil draft.");
        return;
      }
      setDrafts(data.drafts ?? []);
    } catch {
      setError("Gagal ambil draft.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSend(draft: Draft) {
    if (!window.confirm(`Kirim email ke ${draft.to || "(?)"} — "${draft.subject || "(tanpa subjek)"}"?`)) return;
    setBusyId(draft.id);
    setError(null);
    try {
      const res = await fetch("/api/google/gmail/drafts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal kirim draft.");
        return;
      }
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    } catch {
      setError("Gagal kirim draft.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDiscard(draft: Draft) {
    if (!window.confirm("Buang draft ini? Nggak bakal kekirim.")) return;
    setBusyId(draft.id);
    setError(null);
    try {
      const res = await fetch("/api/google/gmail/drafts/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal hapus draft.");
        return;
      }
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    } catch {
      setError("Gagal hapus draft.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Memuat draft...</p>;

  return (
    <div>
      <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">
        Draft Email {drafts.length > 0 && `(${drafts.length})`}
      </p>
      {error && <p className={`${errorBannerClass} mb-2`}>{error}</p>}
      {drafts.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nggak ada draft nunggu. Draft yang Aslan bikinin (lewat &quot;bales email&quot;) bakal muncul di sini
          buat direview sebelum dikirim.
        </p>
      ) : (
        <ul className="divide-y divide-line/60">
          {drafts.map((d) => (
            <li key={d.id} className="py-2.5 first:pt-0 last:pb-0">
              <p className="text-sm text-slate-200 truncate">{d.subject || "(tanpa subjek)"}</p>
              <p className="text-xs text-slate-500 truncate">Ke: {d.to || "(?)"}</p>
              {d.snippet && <p className="text-xs text-slate-600 truncate mt-0.5">{d.snippet}</p>}
              <div className="flex items-center gap-3 mt-1.5">
                <button
                  onClick={() => handleSend(d)}
                  disabled={busyId === d.id}
                  className="text-xs font-mono text-mint-glow hover:text-mint-glow/80 disabled:opacity-50"
                >
                  {busyId === d.id ? "..." : "Kirim"}
                </button>
                <button
                  onClick={() => handleDiscard(d)}
                  disabled={busyId === d.id}
                  className={dangerBtnClass}
                >
                  Buang draft
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button onClick={load} className={`${ghostBtnClass} mt-3`}>
        ↻ Refresh
      </button>
    </div>
  );
}
