"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useVoiceAssistant } from "@/lib/assistant/useVoiceAssistant";
import { useQueryParamNotice } from "@/lib/useQueryParamNotice";
import HudPanel from "@/components/HudPanel";
import ActivityLog from "@/components/asisten/ActivityLog";
import DataExport from "@/components/asisten/DataExport";
import GmailDrafts from "@/components/asisten/GmailDrafts";
import PushNotifications from "@/components/asisten/PushNotifications";
import NotificationPreferences from "@/components/asisten/NotificationPreferences";
import TwoFactorAuth from "@/components/asisten/TwoFactorAuth";
import { primaryBtnClass, ghostBtnClass } from "@/lib/ui";

// A LINK/UNLINK integration card in the integrations grid.
function IntegrationCard({
  title,
  status,
  detail,
  action,
}: {
  title: string;
  status: "connected" | "disconnected" | "info";
  detail: string;
  action?: React.ReactNode;
}) {
  const dot = status === "connected" ? "bg-mint-glow" : status === "disconnected" ? "bg-slate-600" : "bg-cyan-glow";
  return (
    <div className="border border-line rounded-sm p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
          <span className="truncate">{title}</span>
        </p>
        {status !== "info" && (
          <span
            className={`text-[9px] font-mono uppercase tracking-wider shrink-0 ${
              status === "connected" ? "text-mint-glow" : "text-slate-600"
            }`}
          >
            {status === "connected" ? "LINKED" : "UNLINKED"}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-300 truncate">{detail}</p>
      {action}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-line rounded-sm px-3 py-2.5">
      <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className="font-display text-lg text-white">{value}</p>
    </div>
  );
}

export default function AiCorePage() {
  const supabase = createClient();
  // Only need `supported` here (for the Voice integration card and the
  // connected-count stat) -- the mic/hands-free/screen-share controls
  // themselves live on the Memory Map.
  const { supported: voiceSupported } = useVoiceAssistant();

  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailNotice, setGmailNotice] = useState<string | null>(null);

  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramLinking, setTelegramLinking] = useState(false);
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  // Real counts only, same rule as StatusAslan's header pill -- no fabricated
  // latency/uptime numbers in the AI Core stat grid.
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [actionsToday, setActionsToday] = useState<number | null>(null);
  const [totalMessages, setTotalMessages] = useState<number | null>(null);

  useEffect(() => {
    async function loadAiCoreStats() {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [{ count: memCount }, { count: actionCount }, { count: msgCount }] = await Promise.all([
        supabase.from("assistant_memories").select("*", { count: "exact", head: true }),
        supabase
          .from("assistant_audit_log")
          .select("*", { count: "exact", head: true })
          .gte("created_at", todayStart.toISOString()),
        supabase.from("assistant_messages").select("*", { count: "exact", head: true }),
      ]);
      setMemoryCount(memCount ?? 0);
      setActionsToday(actionCount ?? 0);
      setTotalMessages(msgCount ?? 0);
    }
    loadAiCoreStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useQueryParamNotice(["gmail_error", "gmail"], (params) => {
    const gmailError = params.get("gmail_error");
    const gmailConnected = params.get("gmail");
    if (gmailError) setGmailNotice(`Gagal connect Gmail: ${gmailError}`);
    else if (gmailConnected === "connected") setGmailNotice("Gmail berhasil terhubung.");
  });

  useEffect(() => {
    async function loadGmailStatus() {
      setGmailLoading(true);
      const { data } = await supabase
        .from("google_credentials")
        .select("email_address")
        .maybeSingle();
      setGmailEmail(data?.email_address ?? null);
      setGmailLoading(false);
    }
    loadGmailStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDisconnectGmail() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("google_credentials").delete().eq("user_id", user.id);
    setGmailEmail(null);
  }

  async function loadTelegramStatus() {
    setTelegramLoading(true);
    const { data } = await supabase
      .from("telegram_links")
      .select("telegram_username, linked_at")
      .not("linked_at", "is", null)
      .maybeSingle();
    setTelegramLinked(!!data?.linked_at);
    setTelegramUsername(data?.telegram_username ?? null);
    setTelegramLoading(false);
  }

  useEffect(() => {
    loadTelegramStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listens for the webhook (app/api/telegram/webhook) marking this user's
  // row linked, instead of polling every 3s for up to 20 tries. Same ~60s
  // give-up window as the old poll had, so a channel doesn't stay open
  // forever if the user never finishes the Telegram-side confirmation.
  function subscribeForTelegramLink(userId: string) {
    const channel = supabase
      .channel(`telegram-link-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "telegram_links", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { telegram_username: string | null; linked_at: string | null };
          if (!row.linked_at) return;
          setTelegramLinked(true);
          setTelegramUsername(row.telegram_username ?? null);
          setTelegramDeepLink(null);
          supabase.removeChannel(channel);
        }
      )
      .subscribe();
    setTimeout(() => supabase.removeChannel(channel), 60_000);
  }

  async function handleConnectTelegram() {
    setTelegramLinking(true);
    setTelegramError(null);
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setTelegramError(data.error ?? "Gagal generate link Telegram.");
        return;
      }
      setTelegramDeepLink(data.deepLink);
      window.open(data.deepLink, "_blank");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) subscribeForTelegramLink(user.id);
    } catch {
      setTelegramError("Gagal generate link Telegram.");
    } finally {
      setTelegramLinking(false);
    }
  }

  async function handleDisconnectTelegram() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("telegram_links").delete().eq("user_id", user.id);
    setTelegramLinked(false);
    setTelegramUsername(null);
    setTelegramDeepLink(null);
  }

  // Same 4-system count StatusAslan's header pill uses on the Aslan page:
  // Aslan itself always counts, plus the three actually-optional integrations.
  const connectedCount = [true, !!gmailEmail, telegramLinked, voiceSupported].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-mint-glow animate-pulse shrink-0" aria-hidden="true" />
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">AI Core</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">Status &amp; Integrasi</h1>
        </div>
      </header>

      {gmailNotice && (
        <p className="text-xs font-mono text-cyan-glow">{gmailNotice}</p>
      )}

      <HudPanel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <StatCell label="Terhubung" value={`${connectedCount}/4`} />
          <StatCell label="Memori" value={memoryCount ?? "–"} />
          <StatCell label="Aksi Hari Ini" value={actionsToday ?? "–"} />
          <StatCell label="Total Obrolan" value={totalMessages ?? "–"} />
        </div>

        <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">
          Integrasi
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          <IntegrationCard
            title="Gmail & Calendar"
            status={gmailLoading ? "info" : gmailEmail ? "connected" : "disconnected"}
            detail={
              gmailLoading
                ? "Memuat..."
                : gmailEmail
                  ? gmailEmail
                  : "Aslan belum bisa cek email atau kalender kamu."
            }
            action={
              !gmailLoading &&
              (gmailEmail ? (
                <button onClick={handleDisconnectGmail} className={`${ghostBtnClass} self-start`}>
                  Unlink
                </button>
              ) : (
                <a href="/api/google/oauth/start" className={`${primaryBtnClass} self-start`}>
                  Link
                </a>
              ))
            }
          />

          <IntegrationCard
            title="Telegram"
            status={telegramLoading ? "info" : telegramLinked ? "connected" : "disconnected"}
            detail={
              telegramLoading
                ? "Memuat..."
                : telegramLinked
                  ? telegramUsername
                    ? `@${telegramUsername}`
                    : "Terhubung"
                  : telegramDeepLink
                    ? "Buka Telegram, tekan Start di bot-nya..."
                    : "Chat Aslan langsung dari Telegram."
            }
            action={
              !telegramLoading &&
              (telegramLinked ? (
                <button onClick={handleDisconnectTelegram} className={`${ghostBtnClass} self-start`}>
                  Unlink
                </button>
              ) : (
                <button
                  onClick={handleConnectTelegram}
                  disabled={telegramLinking}
                  className={`${primaryBtnClass} self-start`}
                >
                  {telegramLinking ? "Memuat..." : "Link"}
                </button>
              ))
            }
          />
          {telegramError && (
            <p className="text-xs font-mono text-rose-glow sm:col-span-2 -mt-2">{telegramError}</p>
          )}

          <div className="border border-line rounded-sm p-3">
            <PushNotifications />
          </div>

          <IntegrationCard
            title="Voice (TTS/STT)"
            status="info"
            detail={
              voiceSupported
                ? "Browser ini dukung mode suara & hands-free."
                : "Browser ini belum dukung mode suara."
            }
          />
        </div>

        {gmailEmail && (
          <div className="border border-line rounded-sm p-3 mb-5">
            <GmailDrafts />
          </div>
        )}

        <div className="divide-y divide-line/60">
          <div className="py-3 first:pt-0">
            <NotificationPreferences />
          </div>
          <div className="py-3">
            <DataExport />
          </div>
          <div className="py-3 last:pb-0">
            <TwoFactorAuth />
          </div>
        </div>
      </HudPanel>

      <ActivityLog />
    </div>
  );
}
