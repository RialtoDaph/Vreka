"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AssistantMessage } from "@/lib/types";
import { ASSISTANT_MODELS, DEFAULT_ASSISTANT_MODEL, isValidAssistantModel } from "@/lib/assistant/models";
import HudPanel from "@/components/HudPanel";
import ActivityLog from "@/components/asisten/ActivityLog";
import DataExport from "@/components/asisten/DataExport";
import PushNotifications from "@/components/asisten/PushNotifications";
import TwoFactorAuth from "@/components/asisten/TwoFactorAuth";
import { inputClass, primaryBtnClass, ghostBtnClass } from "@/lib/ui";

const MODEL_STORAGE_KEY = "vreka-assistant-model";

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

  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);

  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailNotice, setGmailNotice] = useState<string | null>(null);

  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramLinking, setTelegramLinking] = useState(false);
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (isValidAssistantModel(saved)) setModel(saved);
    setVoiceSupported(
      typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia
    );

    const params = new URLSearchParams(window.location.search);
    const gmailError = params.get("gmail_error");
    const gmailConnected = params.get("gmail");
    if (gmailError) setGmailNotice(`Gagal connect Gmail: ${gmailError}`);
    else if (gmailConnected === "connected") setGmailNotice("Gmail berhasil terhubung.");
    if (gmailError || gmailConnected) {
      window.history.replaceState(null, "", window.location.pathname);
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

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("assistant_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100);
    setMessages(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, recording, transcribing, speaking]);

  async function playAudioBlob(blob: Blob) {
    const audio = audioPlayerRef.current;
    if (!audio) return;
    const url = URL.createObjectURL(blob);
    await new Promise<void>((resolve) => {
      audio.src = url;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.play().catch(() => resolve());
    });
  }

  async function speakText(text: string) {
    setSpeaking(true);
    try {
      const res = await fetch("/api/assistant/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      await playAudioBlob(blob);
    } catch {
      // gagal ngomong bukan hal fatal — teksnya udah kekirim di chat
    } finally {
      setSpeaking(false);
    }
  }

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

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, model }),
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

      if (voiceMode && assistantText) {
        await speakText(assistantText);
      }
    } catch {
      setError("Gagal menghubungi asisten. Coba lagi.");
    } finally {
      setSending(false);
      setAwaitingFirstChunk(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendMessage(text);
  }

  async function handleVoiceBlob(blob: Blob) {
    setTranscribing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("audio", blob, "voice.webm");
      const res = await fetch("/api/assistant/transcribe", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal transkrip suara.");
        return;
      }
      const text = (data.text ?? "").trim();
      if (!text) {
        setError("Nggak kedengeran ngomong apa-apa, coba lagi.");
        return;
      }
      await sendMessage(text);
    } catch {
      setError("Gagal transkrip suara. Coba lagi.");
    } finally {
      setTranscribing(false);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        handleVoiceBlob(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Nggak bisa akses mikrofon. Izinin dulu akses mic di browser.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  const voiceBusy = transcribing || sending || speaking;

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)]">
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
        <div className="flex items-end gap-3">
          {voiceSupported && (
            <button
              type="button"
              onClick={() => setVoiceMode((v) => !v)}
              className={voiceMode ? primaryBtnClass : ghostBtnClass}
            >
              {voiceMode ? "🎤 Mode Suara" : "💬 Mode Teks"}
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

      <HudPanel className="text-sm">
        {gmailNotice && (
          <p className="text-xs font-mono text-cyan-glow mb-2">{gmailNotice}</p>
        )}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-0.5">
              Gmail
            </p>
            <p className="text-slate-300 truncate">
              {gmailLoading
                ? "Memuat..."
                : gmailEmail
                  ? `Terhubung: ${gmailEmail}`
                  : "Belum terhubung — Aslan belum bisa cek/bales email kamu."}
            </p>
          </div>
          {!gmailLoading &&
            (gmailEmail ? (
              <button onClick={handleDisconnectGmail} className={ghostBtnClass}>
                Disconnect
              </button>
            ) : (
              <a href="/api/google/oauth/start" className={primaryBtnClass}>
                Connect Gmail
              </a>
            ))}
        </div>
      </HudPanel>

      <HudPanel className="text-sm">
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
      </HudPanel>

      <HudPanel className="text-sm">
        <PushNotifications />
      </HudPanel>

      <HudPanel className="text-sm">
        <DataExport />
      </HudPanel>

      <HudPanel className="text-sm">
        <TwoFactorAuth />
      </HudPanel>

      <ActivityLog />

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
          {((sending && awaitingFirstChunk) || transcribing) && (
            <div className="flex items-end gap-2 justify-start">
              <img
                src="/aslan.png"
                alt=""
                className="w-7 h-7 rounded-full border border-cyan-glow/40 shrink-0"
              />
              <div className="max-w-[85%] rounded-sm px-3 py-2 text-sm border bg-panel2 border-line text-slate-500 font-mono">
                {transcribing ? "Mentranskrip suara..." : "Mikir..."}
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

        <audio ref={audioPlayerRef} className="hidden" />

        {voiceMode ? (
          <div className="flex flex-col items-center gap-2 mt-4 pt-4 border-t border-line">
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={voiceBusy && !recording}
              className={`w-16 h-16 rounded-full border-2 flex items-center justify-center text-2xl transition-colors ${
                recording
                  ? "bg-rose-glow/20 border-rose-glow text-rose-glow animate-pulse"
                  : "bg-cyan-glow/10 border-cyan-glow/50 text-cyan-glow disabled:opacity-40"
              }`}
            >
              🎤
            </button>
            <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">
              {recording
                ? "Lagi ngerekam — tekan lagi buat kirim"
                : speaking
                  ? "AI lagi ngomong..."
                  : transcribing
                    ? "Mentranskrip..."
                    : sending
                      ? "Mikir..."
                      : "Tekan buat ngomong"}
            </p>
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
    </div>
  );
}
