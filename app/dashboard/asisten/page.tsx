"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AssistantMessage } from "@/lib/types";
import HudPanel from "@/components/HudPanel";
import { inputClass, primaryBtnClass } from "@/lib/ui";

export default function AsistenPage() {
  const supabase = createClient();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
  }, [messages, sending]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setInput("");
    setSending(true);
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

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal menghubungi asisten.");
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            user_id: "",
            role: "assistant",
            content: data.message,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setError("Gagal menghubungi asisten. Coba lagi.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)]">
      <header>
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
          Modul 04
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
          Asisten
        </h1>
      </header>

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
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
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
          {sending && (
            <div className="flex justify-start">
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

        <form onSubmit={handleSend} className="flex gap-2 mt-4 pt-4 border-t border-line">
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
