"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AssistantMessage } from "@/lib/types";
import type { AssistantProvider } from "@/lib/assistant/models";
import { ASLAN_MODES, getAslanMode, type AslanMode } from "@/lib/assistant/modes";
import { useVoiceAssistant, type VoicePhase } from "@/lib/assistant/useVoiceAssistant";
import HudPanel from "@/components/HudPanel";
import ActivityLog from "@/components/asisten/ActivityLog";
import DataExport from "@/components/asisten/DataExport";
import PushNotifications from "@/components/asisten/PushNotifications";
import StatusAslan from "@/components/asisten/StatusAslan";
import TwoFactorAuth from "@/components/asisten/TwoFactorAuth";
import { inputClass, primaryBtnClass, ghostBtnClass } from "@/lib/ui";

// Long assistant replies used to render as one continuously-growing bubble
// -- split into roughly-this-many-characters-per-page chunks (on paragraph
// boundaries where possible) instead, and only for replies actually long
// enough to need it, so a normal short reply stays a plain bubble.
const REPLY_PAGE_CHAR_TARGET = 500;

function paginateReply(text: string): string[] {
  if (text.length <= REPLY_PAGE_CHAR_TARGET) return [text];
  const paragraphs = text.split(/\n{2,}/);
  const pages: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if (current && current.length + para.length + 2 > REPLY_PAGE_CHAR_TARGET) {
      pages.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) pages.push(current);
  return pages.length > 0 ? pages : [text];
}

// A long assistant reply becomes a small paginated card (page dots + arrow
// buttons, swipeable on touch) instead of one tall scrolling wall of text.
function AssistantReplyCard({ content }: { content: string }) {
  const pages = useMemo(() => paginateReply(content), [content]);
  const [page, setPage] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const clampedPage = Math.min(page, pages.length - 1);

  if (pages.length <= 1) {
    return <div className="whitespace-pre-wrap">{content}</div>;
  }

  function goTo(next: number) {
    setPage(Math.max(0, Math.min(pages.length - 1, next)));
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (delta > 40) goTo(clampedPage - 1);
    else if (delta < -40) goTo(clampedPage + 1);
  }

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="whitespace-pre-wrap">{pages[clampedPage]}</div>
      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-line/50">
        <button
          type="button"
          onClick={() => goTo(clampedPage - 1)}
          disabled={clampedPage === 0}
          aria-label="Slide sebelumnya"
          className="w-6 h-6 rounded-full border border-line text-slate-400 hover:text-slate-200 disabled:opacity-30 text-xs shrink-0"
        >
          ‹
        </button>
        <div className="flex items-center gap-1">
          {pages.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${i === clampedPage ? "bg-cyan-glow" : "bg-line"}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(clampedPage + 1)}
          disabled={clampedPage === pages.length - 1}
          aria-label="Slide berikutnya"
          className="w-6 h-6 rounded-full border border-line text-slate-400 hover:text-slate-200 disabled:opacity-30 text-xs shrink-0"
        >
          ›
        </button>
      </div>
      <p className="text-[10px] font-mono text-slate-600 text-center mt-1">
        {clampedPage + 1}/{pages.length}
      </p>
    </div>
  );
}

const VOICE_PHASE_STYLE: Record<VoicePhase, { label: string; text: string; dot: string; border: string }> = {
  idle: { label: "Online", text: "text-cyan-glow", dot: "bg-cyan-glow", border: "border-cyan-glow/50" },
  "wake-listening": { label: "Nunggu 'Aslan'...", text: "text-cyan-glow", dot: "bg-cyan-glow", border: "border-cyan-glow/50" },
  listening: { label: "Lagi dengerin...", text: "text-mint-glow", dot: "bg-mint-glow", border: "border-mint-glow/50" },
  processing: { label: "Mikir...", text: "text-amber-glow", dot: "bg-amber-glow", border: "border-amber-glow/50" },
  speaking: { label: "Ngomong...", text: "text-mint-glow", dot: "bg-mint-glow", border: "border-mint-glow/50" },
  error: { label: "Error", text: "text-rose-glow", dot: "bg-rose-glow", border: "border-rose-glow/50" },
};

// One button in the 5-icon toolbar (real-time mode / screen share / tools /
// hands-free / voice) -- icon-only with an aria-label since there's no room
// for text labels at this size.
function ToolbarIconButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-10 h-10 rounded-full border flex items-center justify-center text-base transition-colors shrink-0 ${
        active
          ? "border-cyan-glow bg-cyan-glow/10 text-cyan-glow shadow-glow"
          : disabled
            ? "border-line/50 text-slate-700 cursor-not-allowed"
            : "border-line text-slate-400 hover:text-slate-200 hover:border-cyan-glow/40"
      }`}
    >
      {icon}
    </button>
  );
}

// One of the 4 mode buttons (Santai/Fokus/Intel/Ultra) that pick Aslan's
// brain + persona + color together -- replaces the old plain model dropdown.
function ModeButton({
  mode,
  active,
  disabled,
  onClick,
}: {
  mode: AslanMode;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? `${mode.label} — key server belum di-set` : mode.tagline}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors shrink-0 ${
        active
          ? "shadow-glow"
          : disabled
            ? "border-line/50 text-slate-700 cursor-not-allowed"
            : "border-line text-slate-400 hover:text-slate-200"
      }`}
      style={active ? { borderColor: mode.colorHex, backgroundColor: `${mode.colorHex}1a`, color: mode.colorHex } : undefined}
    >
      <span aria-hidden="true">{mode.emoji}</span>
      <span>{mode.label}</span>
    </button>
  );
}

// A LINK/UNLINK integration card in the AI Core panel's integrations grid.
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

export default function AsistenPage() {
  const supabase = createClient();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    supported: voiceSupported,
    phase: voicePhase,
    errorMsg: voiceError,
    toggle: toggleVoice,
    audioRef: voiceAudioRef,
    lastReply: voiceLastReply,
    handsFreeSupported,
    handsFreeMode,
    toggleHandsFree,
    mode,
    setMode,
  } = useVoiceAssistant();
  const activeMode = getAslanMode(mode);
  // wake-listening is a passive background state (no mic recording, no
  // server round-trips yet) -- it shouldn't take over the page the way an
  // actual conversation does, so it's excluded from "voice call in progress".
  const voiceActive = voicePhase !== "idle" && voicePhase !== "wake-listening";

  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailNotice, setGmailNotice] = useState<string | null>(null);

  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramLinking, setTelegramLinking] = useState(false);
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Which providers have a server-side API key configured -- null while
  // loading. Kept "fail open" (null = don't disable anything yet) so a slow
  // or failed status check never blocks picking a model.
  const [providerStatus, setProviderStatus] = useState<Record<AssistantProvider, boolean> | null>(null);

  useEffect(() => {
    async function loadProviderStatus() {
      try {
        const res = await fetch("/api/assistant/providers");
        if (!res.ok) return;
        const data = await res.json();
        if (data?.configured) setProviderStatus(data.configured);
      } catch {
        // stays null -- dropdown just shows every option enabled
      }
    }
    loadProviderStatus();
  }, []);

  const [screenShareSupported, setScreenShareSupported] = useState(false);
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setScreenShareSupported(!!navigator.mediaDevices?.getDisplayMedia);
    return () => {
      screenShareStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailError = params.get("gmail_error");
    const gmailConnected = params.get("gmail");
    if (gmailError) setGmailNotice(`Gagal connect Gmail: ${gmailError}`);
    else if (gmailConnected === "connected") setGmailNotice("Gmail berhasil terhubung.");
    if (gmailError || gmailConnected) {
      window.history.replaceState(null, "", window.location.pathname);
      // Redirect balik dari Google OAuth reload halaman ini dari nol, jadi
      // section Pengaturan perlu dibuka otomatis biar notice-nya keliatan.
      setSettingsOpen(true);
    }
  }, []);

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

  function pollForTelegramLink() {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      const { data } = await supabase
        .from("telegram_links")
        .select("telegram_username, linked_at")
        .not("linked_at", "is", null)
        .maybeSingle();
      if (data?.linked_at) {
        setTelegramLinked(true);
        setTelegramUsername(data.telegram_username ?? null);
        setTelegramDeepLink(null);
        clearInterval(interval);
      } else if (attempts >= 20) {
        clearInterval(interval);
      }
    }, 3000);
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
      pollForTelegramLink();
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

  function captureScreenFrame(): string | undefined {
    const video = screenVideoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }

  async function toggleScreenShare() {
    if (screenShareActive) {
      screenShareStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenShareStreamRef.current = null;
      setScreenShareActive(false);
      return;
    }
    setScreenShareError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenShareStreamRef.current = stream;
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
        // play() isn't reliably promise-returning across environments (e.g.
        // jsdom in tests returns undefined instead of a Promise), so guard
        // before chaining .catch() onto it.
        const playResult = screenVideoRef.current.play();
        if (playResult && typeof playResult.then === "function") {
          await playResult.catch(() => {});
        }
      }
      // The browser's own "Stop sharing" control ends the track directly --
      // this is the only way to know that happened without polling.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        screenShareStreamRef.current = null;
        setScreenShareActive(false);
      });
      setScreenShareActive(true);
    } catch {
      setScreenShareError("Gagal mulai screen share. Coba lagi atau izinin akses share screen di browser.");
    }
  }

  async function refreshMessages() {
    const { data } = await supabase
      .from("assistant_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100);
    setMessages(data ?? []);
  }

  async function load() {
    setLoading(true);
    await refreshMessages();
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Voice turns are handled entirely inside useVoiceAssistant (its own
  // record -> transcribe -> chat -> speak loop) rather than through
  // sendMessage(), so this page's own message list doesn't get the usual
  // optimistic update -- it only learns a turn happened via `lastReply`.
  // runAssistantChat persists both sides of that turn via next/server's
  // after() *after* the response is already sent, so there's an inherent
  // small lag before a fresh fetch here is guaranteed to see it.
  useEffect(() => {
    if (!voiceLastReply) return;
    const timeout = setTimeout(refreshMessages, 700);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceLastReply]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, voicePhase]);

  async function sendMessage(text: string) {
    if (!text || sending) return;

    setError(null);
    setSending(true);
    setAwaitingFirstChunk(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `optimistic-${Date.now()}`,
        user_id: "",
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      },
    ]);

    const assistantId = `assistant-${Date.now()}`;
    let assistantText = "";
    let started = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    // Grabbed fresh per message (not once when sharing starts) so Aslan
    // always sees whatever's on screen right now, not a stale first frame.
    const image = screenShareActive ? captureScreenFrame() : undefined;

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, mode, image }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Gagal menghubungi asisten.");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Response tanpa body.");
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        assistantText += chunk;
        if (!started) {
          started = true;
          setAwaitingFirstChunk(false);
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              user_id: "",
              role: "assistant",
              content: assistantText,
              created_at: new Date().toISOString(),
            },
          ]);
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: assistantText } : m))
          );
        }
      }
    } catch (err) {
      // A user-triggered stop throws an AbortError -- that's not a failure,
      // just keep whatever partial reply had already streamed in.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError("Gagal menghubungi asisten. Coba lagi.");
      }
    } finally {
      abortControllerRef.current = null;
      setSending(false);
      setAwaitingFirstChunk(false);
    }
  }

  function stopGenerating() {
    abortControllerRef.current?.abort();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendMessage(text);
  }

  // Same 4-system count StatusAslan's header pill uses: Aslan itself always
  // counts, plus the three actually-optional integrations.
  const connectedCount = [true, !!gmailEmail, telegramLinked, voiceSupported].filter(Boolean).length;

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] overflow-y-auto">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <img
            src="/aslan.png"
            alt=""
            className="w-11 h-11 rounded-full border-2 shadow-glow"
            style={{ borderColor: activeMode.colorHex }}
          />
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
              Modul 04
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
              Aslan
            </h1>
          </div>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
              Mode
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {ASLAN_MODES.map((m) => (
                <ModeButton
                  key={m.id}
                  mode={m}
                  active={mode === m.id}
                  disabled={providerStatus ? !providerStatus[m.primaryProvider] : false}
                  onClick={() => setMode(m.id)}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {screenShareSupported && (
              <ToolbarIconButton
                icon="🖥️"
                label={screenShareActive ? "Matiin screen share" : "Share screen ke Aslan"}
                active={screenShareActive}
                onClick={toggleScreenShare}
              />
            )}
            <ToolbarIconButton
              icon="🧰"
              label="Tools & Integrasi"
              active={settingsOpen}
              onClick={() => setSettingsOpen((o) => !o)}
            />
            {handsFreeSupported && (
              <ToolbarIconButton
                icon="👂"
                label={handsFreeMode ? "Matiin mode hands-free" : "Nyalain mode hands-free (panggil 'Aslan')"}
                active={handsFreeMode}
                onClick={toggleHandsFree}
              />
            )}
            {voiceSupported && (
              <ToolbarIconButton
                icon="🎤"
                label={voiceActive ? "Stop mode suara" : "Mode suara"}
                active={voiceActive}
                onClick={toggleVoice}
              />
            )}
          </div>
        </div>
      </header>

      {/* Hidden -- only used as a frame source for screen-share snapshots,
          never shown to the user directly. */}
      <video ref={screenVideoRef} className="hidden" muted playsInline />

      {voicePhase === "wake-listening" && (
        <p className="text-xs font-mono text-cyan-glow flex items-center gap-1.5 -mt-3">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-glow animate-pulse" />
          Mode hands-free aktif — bilang &quot;Aslan&quot; buat mulai ngobrol.
        </p>
      )}

      {screenShareActive && (
        <p className="text-xs font-mono text-cyan-glow flex items-center gap-1.5 -mt-3">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-glow animate-pulse" />
          Screen share aktif — Aslan liat snapshot layar kamu tiap kamu kirim pesan (pake Claude, walau mode teks lagi
          di provider lain).
        </p>
      )}
      {screenShareError && (
        <p className="text-xs font-mono text-rose-glow -mt-3">{screenShareError}</p>
      )}

      <StatusAslan
        gmailConnected={!!gmailEmail}
        telegramConnected={telegramLinked}
        voiceSupported={voiceSupported}
        onManage={() => setSettingsOpen(true)}
      />

      <HudPanel className="flex-1 flex flex-col min-h-0" as="section">
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <p className="text-sm text-slate-500">Memuat...</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-slate-500">
              Belum ada percakapan. Tanya apa aja soal keuangan, kerjaan, atau
              pelajaran kamu — atau minta dicatetin sesuatu.
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role !== "user" && (
                  <img
                    src="/aslan.png"
                    alt=""
                    className="w-7 h-7 rounded-full border border-cyan-glow/40 shrink-0"
                  />
                )}
                <div
                  className={`max-w-[85%] rounded-sm px-3 py-2 text-sm border ${
                    m.role === "user"
                      ? "bg-cyan-glow/10 border-cyan-glow/40 text-slate-100 whitespace-pre-wrap"
                      : "bg-panel2 border-line text-slate-200"
                  }`}
                >
                  {m.role === "user" ? m.content : <AssistantReplyCard content={m.content} />}
                </div>
              </div>
            ))
          )}
          {sending && awaitingFirstChunk && (
            <div className="flex items-end gap-2 justify-start">
              <img
                src="/aslan.png"
                alt=""
                className="w-7 h-7 rounded-full border border-cyan-glow/40 shrink-0"
              />
              <div className="max-w-[85%] rounded-sm px-3 py-2 text-sm border bg-panel2 border-line text-slate-500 font-mono">
                Mikir...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <p className="text-rose-glow text-xs font-mono border border-rose-glow/30 bg-rose-glow/5 rounded-sm px-3 py-2 mt-3">
            {error}
          </p>
        )}

        <audio ref={voiceAudioRef} className="hidden" />

        {sending && (
          <div className="flex justify-center mt-3">
            <button
              type="button"
              onClick={stopGenerating}
              className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-rose-glow border border-rose-glow/40 bg-rose-glow/10 rounded-full px-4 py-2"
            >
              <span className="w-2 h-2 rounded-sm bg-rose-glow" aria-hidden="true" />
              Stop generating
            </button>
          </div>
        )}

        {voiceActive ? (
          <div className="flex flex-col items-center gap-2 mt-4 pt-4 border-t border-line">
            <button
              type="button"
              onClick={toggleVoice}
              aria-label="Hentikan mode suara"
              className={`w-16 h-16 rounded-full border-2 flex items-center justify-center text-2xl transition-colors bg-panel2 ${VOICE_PHASE_STYLE[voicePhase].border} ${VOICE_PHASE_STYLE[voicePhase].text} ${voicePhase === "listening" || voicePhase === "speaking" ? "animate-pulse" : ""}`}
            >
              🎤
            </button>
            <p
              className={`text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 ${VOICE_PHASE_STYLE[voicePhase].text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${VOICE_PHASE_STYLE[voicePhase].dot}`} />
              {VOICE_PHASE_STYLE[voicePhase].label}
            </p>
            {voiceError && <p className="text-xs text-rose-glow">{voiceError}</p>}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2 mt-4 pt-4 border-t border-line">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tanya atau minta dicatetin sesuatu..."
              className={inputClass}
              disabled={sending}
            />
            <button type="submit" disabled={sending || !input.trim()} className={primaryBtnClass}>
              Kirim
            </button>
          </form>
        )}
      </HudPanel>

      <div>
        <button
          onClick={() => setSettingsOpen((o) => !o)}
          className="text-xs font-mono uppercase tracking-wider text-slate-500 hover:text-slate-300"
        >
          {settingsOpen ? "▾" : "▸"} AI Core
        </button>
        {settingsOpen && (
          <HudPanel className="text-sm mt-2">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4 pb-4 border-b border-line/60">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-mint-glow animate-pulse" aria-hidden="true" />
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-glow">AI Core</p>
              </div>
              <p className="text-[10px] font-mono text-slate-500">Status sistem Aslan &amp; integrasi</p>
            </div>

            {gmailNotice && (
              <p className="text-xs font-mono text-cyan-glow mb-3">{gmailNotice}</p>
            )}

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

            <div className="divide-y divide-line/60">
              <div className="py-3 first:pt-0">
                <DataExport />
              </div>
              <div className="py-3 last:pb-0">
                <TwoFactorAuth />
              </div>
            </div>
          </HudPanel>
        )}
        {settingsOpen && <ActivityLog />}
      </div>
    </div>
  );
}
