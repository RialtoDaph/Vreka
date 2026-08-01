"use client";

import { useEffect, useRef, useState } from "react";
import VoiceOrb, { type OrbState } from "@/components/VoiceOrb";
import { DEFAULT_ASSISTANT_MODEL, isValidAssistantModel } from "@/lib/assistant/models";
import { ghostBtnClass, primaryBtnClass } from "@/lib/ui";

const MODEL_STORAGE_KEY = "vreka-assistant-model";
const SILENCE_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 1200;
const MIN_SPEECH_MS = 400;
const MAX_RECORD_MS = 20000;

type Phase = "idle" | "listening" | "processing" | "speaking" | "paused" | "error";

export default function VoiceCallOverlay({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [userText, setUserText] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pausedRef = useRef(false);
  const stoppedRef = useRef(false);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const modelRef = useRef(DEFAULT_ASSISTANT_MODEL);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (isValidAssistantModel(saved)) modelRef.current = saved;
    return () => {
      stoppedRef.current = true;
    };
  }, []);

  function orbStateFromPhase(p: Phase): OrbState {
    if (p === "listening") return "listening";
    if (p === "processing") return "thinking";
    if (p === "speaking") return "speaking";
    return "idle";
  }

  async function recordUntilSilence(): Promise<Blob | null> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioContextCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioContextCtor();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const cleanup = () => {
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
    };

    return new Promise((resolve) => {
      let settled = false;
      recorder.onstop = () => {
        cleanup();
        if (settled) return;
        settled = true;
        resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null);
      };

      recorder.start();
      const startedAt = Date.now();
      let silenceStart: number | null = null;
      let hasSpoken = false;

      function tick() {
        if (stoppedRef.current || pausedRef.current) {
          if (recorder.state !== "inactive") recorder.stop();
          return;
        }
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const norm = (data[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const elapsed = Date.now() - startedAt;

        if (rms > SILENCE_THRESHOLD) {
          hasSpoken = true;
          silenceStart = null;
        } else if (hasSpoken && elapsed > MIN_SPEECH_MS) {
          if (silenceStart === null) silenceStart = Date.now();
          else if (Date.now() - silenceStart > SILENCE_DURATION_MS) {
            recorder.stop();
            return;
          }
        }

        if (elapsed > MAX_RECORD_MS) {
          recorder.stop();
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

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

  async function speak(text: string) {
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
      // gagal ngomong bukan fatal, teksnya tetep ada di caption
    }
  }

  async function runLoop() {
    while (!stoppedRef.current && !pausedRef.current) {
      setPhase("listening");
      setErrorMsg(null);
      let blob: Blob | null = null;
      try {
        blob = await recordUntilSilence();
      } catch {
        setErrorMsg("Nggak bisa akses mikrofon. Izinin dulu akses mic di browser.");
        setPhase("error");
        return;
      }
      if (stoppedRef.current || pausedRef.current) break;
      if (!blob) continue;

      setPhase("processing");
      const form = new FormData();
      form.append("audio", blob, "voice.webm");
      let text = "";
      try {
        const res = await fetch("/api/assistant/transcribe", { method: "POST", body: form });
        const data = await res.json();
        if (res.ok) text = (data.text ?? "").trim();
      } catch {
        // coba lagi dari listening
      }
      if (stoppedRef.current || pausedRef.current) break;
      if (!text) continue;

      setUserText(text);

      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, model: modelRef.current }),
        });
        const data = await res.json();
        const reply = res.ok ? (data.message as string) : "Maaf, ada masalah pas mikir.";
        setAssistantText(reply);
        if (stoppedRef.current || pausedRef.current) break;
        setPhase("speaking");
        await speak(reply);
      } catch {
        setAssistantText("Gagal menghubungi Aslan. Coba lagi.");
      }
    }
    if (!stoppedRef.current) setPhase("paused");
  }

  function handleStart() {
    pausedRef.current = false;
    stoppedRef.current = false;
    runLoop();
  }

  function handlePause() {
    pausedRef.current = true;
    setPhase("paused");
  }

  function handleResume() {
    pausedRef.current = false;
    runLoop();
  }

  function handleClose() {
    stoppedRef.current = true;
    pausedRef.current = true;
    audioPlayerRef.current?.pause();
    onClose();
  }

  const statusLabel: Record<Phase, string> = {
    idle: "Tekan buat mulai ngobrol",
    listening: "Dengerin...",
    processing: "Mikir...",
    speaking: "Aslan lagi ngomong...",
    paused: "Dijeda — tekan buat lanjut",
    error: "Ada masalah",
  };

  return (
    <div className="fixed inset-0 z-50 bg-void/95 backdrop-blur-sm flex flex-col items-center justify-center px-6">
      <button
        onClick={handleClose}
        className="absolute top-5 right-5 text-slate-400 hover:text-white text-sm font-mono uppercase tracking-wider"
        aria-label="Tutup"
      >
        ✕ Tutup
      </button>

      <div className="w-56 h-56 sm:w-72 sm:h-72 mb-8">
        <VoiceOrb state={orbStateFromPhase(phase)} />
      </div>

      <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-6">
        {statusLabel[phase]}
      </p>

      {errorMsg && (
        <p className="text-rose-glow text-sm font-mono mb-4 text-center max-w-sm">{errorMsg}</p>
      )}

      <div className="max-w-md w-full text-center space-y-3 mb-8 min-h-[4rem]">
        {userText && (
          <p className="text-sm text-slate-400">
            <span className="text-slate-600">Kamu: </span>
            {userText}
          </p>
        )}
        {assistantText && (
          <p className="text-sm text-slate-100">
            <span className="text-cyan-glow">Aslan: </span>
            {assistantText}
          </p>
        )}
      </div>

      <audio ref={audioPlayerRef} className="hidden" />

      {phase === "idle" || phase === "error" ? (
        <button onClick={handleStart} className={primaryBtnClass}>
          🎤 Mulai Ngobrol
        </button>
      ) : phase === "paused" ? (
        <button onClick={handleResume} className={primaryBtnClass}>
          ▶ Lanjut
        </button>
      ) : (
        <button onClick={handlePause} className={ghostBtnClass}>
          ⏸ Pause
        </button>
      )}
    </div>
  );
}
