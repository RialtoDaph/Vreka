"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_ASSISTANT_MODEL, isValidAssistantModel } from "@/lib/assistant/models";

const MODEL_STORAGE_KEY = "vreka-assistant-model";
const SILENCE_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 1200;
const MIN_SPEECH_MS = 400;
const MAX_RECORD_MS = 20000;

type Phase = "idle" | "listening" | "processing" | "speaking" | "error";

export default function VoiceCallLauncher() {
  const [supported, setSupported] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stoppedRef = useRef(true);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const modelRef = useRef(DEFAULT_ASSISTANT_MODEL);

  useEffect(() => {
    setSupported(
      typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia
    );
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (isValidAssistantModel(saved)) modelRef.current = saved;
    return () => {
      stoppedRef.current = true;
    };
  }, []);

  // Biar Quick Commands (atau tombol lain di halaman manapun) bisa mulai/stop
  // voice call ini tanpa perlu prop-drilling, soalnya launcher-nya global di layout.
  useEffect(() => {
    window.addEventListener("vreka:toggle-voice", handleToggle);
    return () => window.removeEventListener("vreka:toggle-voice", handleToggle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        if (stoppedRef.current) {
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
      // gagal ngomong bukan fatal, lanjut aja ke giliran dengerin lagi
    }
  }

  async function runLoop() {
    while (!stoppedRef.current) {
      setPhase("listening");
      let blob: Blob | null = null;
      try {
        blob = await recordUntilSilence();
      } catch {
        setErrorMsg("Nggak bisa akses mikrofon. Izinin dulu akses mic di browser.");
        setPhase("error");
        stoppedRef.current = true;
        return;
      }
      if (stoppedRef.current) break;
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
      if (stoppedRef.current) break;
      if (!text) continue;

      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, model: modelRef.current }),
        });
        const data = await res.json();
        const reply = res.ok ? (data.message as string) : "Maaf, ada masalah pas mikir.";
        if (stoppedRef.current) break;
        setPhase("speaking");
        await speak(reply);
      } catch {
        // gagal ngehubungin Aslan, lanjut coba lagi dari listening
      }
    }
    setPhase("idle");
  }

  function handleToggle() {
    if (stoppedRef.current) {
      stoppedRef.current = false;
      setErrorMsg(null);
      runLoop();
    } else {
      stoppedRef.current = true;
      audioPlayerRef.current?.pause();
      setPhase("idle");
    }
  }

  if (!supported) return null;

  const active = phase !== "idle" && phase !== "error";
  const statusLabel =
    phase === "listening"
      ? "Lagi dengerin..."
      : phase === "processing"
        ? "Mikir..."
        : phase === "speaking"
          ? "Ngomong..."
          : phase === "error"
            ? "Error"
            : "Tekan buat ngobrol";

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4 flex flex-col items-center gap-2">
      <button
        onClick={handleToggle}
        data-phase={phase}
        className={`w-full flex items-center gap-3 rounded-full border backdrop-blur-sm px-4 py-2.5 transition-colors ${
          active
            ? "bg-panel/90 border-cyan-glow/60 shadow-glow"
            : "bg-panel/70 border-line hover:border-cyan-glow/40"
        }`}
        aria-label={active ? "Hentikan ngobrol sama Aslan" : "Ngobrol sama Aslan"}
        title={active ? "Hentikan ngobrol" : "Ngobrol sama Aslan"}
      >
        <span className="aslan-avatar w-9 h-9 shrink-0">
          <img src="/aslan.png" alt="" />
        </span>
        <span className="min-w-0 text-left">
          <span className="block font-display text-xs font-semibold uppercase tracking-widest text-white">
            Ngobrol Sama Aslan
          </span>
          <span className="block text-[11px] font-mono text-cyan-glow truncate">
            {statusLabel}
          </span>
        </span>
      </button>
      {errorMsg && (
        <p className="text-rose-glow text-xs font-mono text-center">{errorMsg}</p>
      )}
      <audio ref={audioPlayerRef} className="hidden" />
    </div>
  );
}
