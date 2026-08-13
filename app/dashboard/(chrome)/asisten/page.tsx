"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AssistantMessage } from "@/lib/types";
import { ASSISTANT_MODELS } from "@/lib/assistant/models";
import { useVoiceAssistant } from "@/lib/assistant/useVoiceAssistant";
import { readTextStream } from "@/lib/assistant/streamText";
import HudPanel from "@/components/HudPanel";
import StatusAslan from "@/components/asisten/StatusAslan";
import { inputClass, primaryBtnClass } from "@/lib/ui";

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
          className="w-8 h-8 rounded-full border border-line text-slate-400 hover:text-slate-200 disabled:opacity-30 text-xs shrink-0"
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
          className="w-8 h-8 rounded-full border border-line text-slate-400 hover:text-slate-200 disabled:opacity-30 text-xs shrink-0"
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

export default function AsistenPage() {
  const supabase = createClient();
  const router = useRouter();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Voice controls (screen share, hands-free, mic) live on the Memory Map
  // now -- this page keeps `supported` (an informational capability check
  // for StatusAslan) and `model`/`setModel` (the model dropdown below still
  // lives here) but doesn't drive an active call itself.
  const { supported: voiceSupported, model, setModel } = useVoiceAssistant();

  const [gmailConnected, setGmailConnected] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState(false);

  // StatusAslan's connected-count pill needs to know Gmail/Telegram state
  // too, but managing/connecting them now happens entirely on the AI Core
  // page -- this is read-only, just enough to render the pill correctly.
  useEffect(() => {
    async function loadConnectionFlags() {
      const [{ data: gmailCred }, { data: telegramLink }] = await Promise.all([
        supabase.from("google_credentials").select("email_address").maybeSingle(),
        supabase.from("telegram_links").select("linked_at").not("linked_at", "is", null).maybeSingle(),
      ]);
      setGmailConnected(!!gmailCred?.email_address);
      setTelegramConnected(!!telegramLink?.linked_at);
    }
    loadConnectionFlags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

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

      await readTextStream(res, (chunk) => {
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
      });
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
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as typeof model)}
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
        gmailConnected={gmailConnected}
        telegramConnected={telegramConnected}
        voiceSupported={voiceSupported}
        onManage={() => router.push("/dashboard/ai-core")}
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
      </HudPanel>
    </div>
  );
}
