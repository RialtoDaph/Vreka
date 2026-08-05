"use client";

import { useRef, useState } from "react";
import { startRealtimeSession } from "@/lib/assistant/realtimeVoice";

export type GptRealtimePhase = "idle" | "listening" | "speaking" | "error";

// Small, self-contained hook for the dedicated "GPT real-time" toolbar
// button on Memory Map -- deliberately kept separate from
// useVoiceAssistant() (Aslan's own Claude + ElevenLabs voice loop) instead
// of adding a second engine back into that hook, so the two voice paths
// can't tangle with each other again.
export function useGptRealtime() {
  const [phase, setPhase] = useState<GptRealtimePhase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  async function start() {
    const audio = audioRef.current;
    if (!audio) return;
    setErrorMsg(null);
    setLastReply(null);
    setPhase("listening");
    try {
      const session = await startRealtimeSession(audio, {
        onAssistantTranscriptDone: (text) => setLastReply(text),
        onSpeechStarted: () => setPhase("listening"),
        onResponseStarted: () => setPhase("speaking"),
        onResponseDone: () => setPhase("listening"),
        onError: (message) => {
          stopRef.current = null;
          setErrorMsg(message);
          setPhase("error");
        },
      });
      stopRef.current = session.stop;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal mulai GPT real-time.");
      setPhase("error");
    }
  }

  function stop() {
    stopRef.current?.();
    stopRef.current = null;
    setPhase("idle");
  }

  function toggle() {
    if (phase === "idle" || phase === "error") start();
    else stop();
  }

  return { phase, errorMsg, lastReply, audioRef, toggle };
}
