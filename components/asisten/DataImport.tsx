"use client";

import { useRef, useState } from "react";
import { useConfirm } from "@/lib/useConfirm";
import { ghostBtnClass } from "@/lib/ui";

type ImportResult = { imported: number; error?: string };

// Counterpart to DataExport -- restores a Vreka export JSON back into the
// current account. Runs through the user's own session client server-side
// (RLS-enforced), so this can only ever write into that user's own rows
// no matter what user_id the file happens to carry.
export default function DataImport() {
  const { confirm, confirmDialog } = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ totalRows: number; failedTables: string[] } | null>(null);

  function handlePick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be re-selected later
    if (!file) return;

    setError(null);
    setSummary(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setError("File bukan JSON yang valid.");
      return;
    }

    if (
      !(await confirm(
        "Import bakal nimpa data yang ID-nya sama persis dengan yang ada di file ini. Data lain nggak kesentuh. Lanjut?"
      ))
    ) {
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/data-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(responseBody.error ?? "Gagal import data.");
        return;
      }
      const results = (responseBody.results ?? {}) as Record<string, ImportResult>;
      const totalRows = Object.values(results).reduce((sum, r) => sum + r.imported, 0);
      const failedTables = Object.entries(results)
        .filter(([, r]) => r.error)
        .map(([table]) => table);
      setSummary({ totalRows, failedTables });
    } catch {
      setError("Gagal import data. Coba lagi.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-[11px] font-mono uppercase tracking-wider text-fg-subtle mb-0.5">
          Import / Restore
        </p>
        <p className="text-fg-muted text-sm">
          Pulihin data dari file export JSON Vreka — data yang ID-nya sama bakal ditimpa.
        </p>
        {error && <p className="text-xs text-rose-glow mt-1">{error}</p>}
        {summary && (
          <p className={`text-xs mt-1 ${summary.failedTables.length > 0 ? "text-amber-glow" : "text-mint-glow"}`}>
            {summary.totalRows} baris berhasil di-import.
            {summary.failedTables.length > 0 && ` Gagal di: ${summary.failedTables.join(", ")}.`}
          </p>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Pilih file export"
      />
      <button onClick={handlePick} disabled={importing} className={ghostBtnClass}>
        {importing ? "Mengimpor..." : "Import Data"}
      </button>
      {confirmDialog}
    </div>
  );
}
