"use client";

import { useEffect, useState } from "react";
import { ghostBtnClass, primaryBtnClass } from "@/lib/ui";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type Status = "checking" | "unsupported" | "no-key" | "denied" | "off" | "on";

export default function PushNotifications() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    async function check() {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      if (!publicKey) {
        setStatus("no-key");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    }
    check();
  }, [publicKey]);

  async function handleEnable() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Gagal aktifin notifikasi.");
        return;
      }
      setStatus("on");
    } catch {
      setError("Gagal aktifin notifikasi. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      setError("Gagal matiin notifikasi. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const statusText: Record<Status, string> = {
    checking: "Memuat...",
    unsupported: "Browser ini nggak dukung push notification.",
    "no-key": "Belum dikonfigurasi server (VAPID key belum di-set).",
    denied: "Izin notifikasi ditolak — aktifin manual lewat pengaturan browser.",
    off: "Nonaktif — dapet reminder budget/tugas telat langsung ke HP.",
    on: "Aktif di device ini.",
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-0.5">
          Push Notification
        </p>
        <p className="text-slate-300 text-sm">{statusText[status]}</p>
        {error && <p className="text-xs text-rose-glow mt-1">{error}</p>}
      </div>
      {status === "off" && (
        <button onClick={handleEnable} disabled={busy} className={primaryBtnClass}>
          {busy ? "Mengaktifkan..." : "Aktifkan"}
        </button>
      )}
      {status === "on" && (
        <button onClick={handleDisable} disabled={busy} className={ghostBtnClass}>
          {busy ? "Menonaktifkan..." : "Matikan"}
        </button>
      )}
    </div>
  );
}
