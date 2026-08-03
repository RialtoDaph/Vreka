"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AssistantMessage } from "@/lib/types";
import { ASSISTANT_MODELS, DEFAULT_ASSISTANT_MODEL, isValidAssistantModel } from "@/lib/assistant/models";
import { useVoiceAssistant, type VoicePhase } from "@/lib/assistant/useVoiceAssistant";
import HudPanel from "@/components/HudPanel";
import ActivityLog from "@/components/asisten/ActivityLog";
import DataExport from "@/components/asisten/DataExport";
import PushNotifications from "@/components/asisten/PushNotifications";
import StatusAslan from "@/components/asisten/StatusAslan";
import TwoFactorAuth from "@/components/asisten/TwoFactorAuth";
import { inputClass, primaryBtnClass, ghostBtnClass } from "@/lib/ui";

const MODEL_STORAGE_KEY = "vreka-assistant-model";

const VOICE_PHASE_STYLE: Record<VoicePhase, { label: string; text: string; dot: string; border: string }> = {
  idle: { label: "Online", text: "text-cyan-glow", dot: "bg-cyan-glow", border: "border-cyan-glow/50" },
  listening: { label: "Lagi dengerin...", text: "text-mint-glow", dot: "bg-mint-glow", border: "border-mint-glow/50" },
  processing: { label: "Mikir...", text: "text-amber-glow", dot: "bg-amber-glow", border: "border-amber-glow/50" },
  speaking: { label: "Ngomong...", text: "text-mint-glow", dot: "bg-mint-glow", border: "border-mint-glow/50" },
  error: { label: "Error", text: "text-rose-glow", dot: "bg-rose-glow", border: "border-rose-glow/50" },
};

export default function AsistenPage() {
  const supabase = createClient();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(DEFAULT_ASSISTANT_MODEL);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    supported: voiceSupported,
    phase: voicePhase,
    errorMsg: voiceError,
    toggle: toggleVoice,
    audioRef: voiceAudioRef,
    lastReply: voiceLastReply,
  } = useVoiceAssistant();
  const voiceActive = voicePhase !== "idle";

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

  useEffect(() => {
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (isValidAssistantModel(saved)) setModel(saved);

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

  function handleModelChange(value: string) {
    if (!isValidAssistantModel(value)) return;
    setModel(value);
    window.localStorage.setItem(MODEL_STORAGE_KEY, value);
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

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, model }),
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

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] overflow-y-auto">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <img
            src="/aslan.png"
            alt=""
            className="w-11 h-11 rounded-full border border-cyan-glow/40 shadow-glow"
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
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleVoice}
              className={voiceActive ? primaryBtnClass : ghostBtnClass}
            >
              {voiceActive ? "⏹ Stop Mode Suara" : "🎤 Mode Suara"}
            </button>
          )}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="bg-panel2 border border-line rounded-sm px-3 py-2 text-sm text-white focus:border-cyan-glow/60 transition-colors"
            >
              {ASSISTANT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.tagline}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

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
                  className={`max-w-[85%] rounded-sm px-3 py-2 text-sm whitespace-pre-wrap border ${
                    m.role === "user"
                      ? "bg-cyan-glow/10 border-cyan-glow/40 text-slate-100"
                      : "bg-panel2 border-line text-slate-200"
                  }`}
                >
                  {m.content}
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
          {settingsOpen ? "▾" : "▸"} Pengaturan & Integrasi
        </button>
        {settingsOpen && (
          <HudPanel className="text-sm mt-2">
            <div className="divide-y divide-line/60">
              <div className="py-3 first:pt-0">
                {gmailNotice && (
                  <p className="text-xs font-mono text-cyan-glow mb-2">{gmailNotice}</p>
                )}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-0.5">
                      Gmail & Google Calendar
                    </p>
                    <p className="text-slate-300 truncate">
                      {gmailLoading
                        ? "Memuat..."
                        : gmailEmail
                          ? `Terhubung: ${gmailEmail}`
                          : "Belum terhubung — Aslan belum bisa cek/bales email atau baca/bikin event Calendar kamu."}
                    </p>
                  </div>
                  {!gmailLoading &&
                    (gmailEmail ? (
                      <button onClick={handleDisconnectGmail} className={ghostBtnClass}>
                        Disconnect
                      </button>
                    ) : (
                      <a href="/api/google/oauth/start" className={primaryBtnClass}>
                        Connect Gmail & Calendar
                      </a>
                    ))}
                </div>
              </div>

              <div className="py-3">
                {telegramError && (
                  <p className="text-xs font-mono text-rose-glow mb-2">{telegramError}</p>
                )}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-0.5">
                      Telegram
                    </p>
                    <p className="text-slate-300 truncate">
                      {telegramLoading
                        ? "Memuat..."
                        : telegramLinked
                          ? `Terhubung${telegramUsername ? `: @${telegramUsername}` : ""}`
                          : telegramDeepLink
                            ? "Buka Telegram, tekan Start di bot-nya buat nyelesain koneksi..."
                            : "Belum terhubung — chat Aslan langsung dari Telegram."}
                    </p>
                  </div>
                  {!telegramLoading &&
                    (telegramLinked ? (
                      <button onClick={handleDisconnectTelegram} className={ghostBtnClass}>
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={handleConnectTelegram}
                        disabled={telegramLinking}
                        className={primaryBtnClass}
                      >
                        {telegramLinking ? "Memuat..." : "Connect Telegram"}
                      </button>
                    ))}
                </div>
              </div>

              <div className="py-3">
                <PushNotifications />
              </div>

              <div className="py-3">
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
