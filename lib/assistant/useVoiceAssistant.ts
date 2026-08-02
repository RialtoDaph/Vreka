"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_ASSISTANT_MODEL, isValidAssistantModel } from "@/lib/assistant/models";

const MODEL_STORAGE_KEY = "vreka-assistant-model";
const SILENCE_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 900;
const MIN_SPEECH_MS = 400;
const MAX_RECORD_MS = 20000;
// Barge-in: shorter confirm window than MIN_SPEECH_MS so cutting in feels
// immediate, while still ignoring brief clicks/coughs.
const BARGE_IN_CONFIRM_MS = 300;

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export type VoicePhase = "idle" | "listening" | "processing" | "speaking" | "error";

/**
 * Shared state machine behind talking to Aslan — used by both the bottom-bar
 * launcher and the Memory Map's radial voice dial so there's one source of
 * truth for mic/TTS/barge-in behavior instead of two competing copies.
 */
export function useVoiceAssistant() {
  const [supported, setSupported] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stoppedRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement>(null);
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

  function getAudioContextCtor() {
    return (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    );
  }

  // Biar Quick Commands (atau tombol lain di halaman manapun) bisa mulai/stop
  // voice call ini tanpa perlu prop-drilling, soalnya hook-nya dipakai lepas
  // di beberapa tempat (bottom bar & voice dial).
  useEffect(() => {
    window.addEventListener("vreka:toggle-voice", toggle);
    return () => window.removeEventListener("vreka:toggle-voice", toggle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function recordUntilSilence(): Promise<Blob | null> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
    const AudioContextCtor = getAudioContextCtor();
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

  // Watches the mic while Aslan's reply is playing. Resolves "interrupted" the
  // moment the user starts talking (and stops playback right there), or
  // "finished" once the audio ends naturally.
  async function watchForBargeIn(audio: HTMLAudioElement): Promise<"interrupted" | "finished"> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
    } catch {
      return new Promise((resolve) => {
        audio.onended = () => resolve("finished");
      });
    }
    const AudioContextCtor = getAudioContextCtor();
    const audioCtx = new AudioContextCtor();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const cleanup = () => {
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
    };

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: "interrupted" | "finished") => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      audio.onended = () => finish("finished");

      let voiceStart: number | null = null;
      function tick() {
        if (settled || stoppedRef.current) {
          finish("finished");
          return;
        }
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const norm = (data[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / data.length);

        if (rms > SILENCE_THRESHOLD) {
          if (voiceStart === null) voiceStart = Date.now();
          else if (Date.now() - voiceStart > BARGE_IN_CONFIRM_MS) {
            audio.pause();
            finish("interrupted");
            return;
          }
        } else {
          voiceStart = null;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  // Plays Aslan's reply while listening for an interruption. If the user
  // barges in, returns the blob of what they said so the loop can skip
  // straight to processing it instead of waiting through another silence.
  async function speakWithBargeIn(text: string): Promise<Blob | null> {
    const audio = audioRef.current;
    if (!audio) return null;
    try {
      const res = await fetch("/api/assistant/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audio.src = url;
      await audio.play().catch(() => {});
      const result = await watchForBargeIn(audio);
      URL.revokeObjectURL(url);

      if (result === "interrupted" && !stoppedRef.current) {
        setPhase("listening");
        try {
          return await recordUntilSilence();
        } catch {
          return null;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // `initialText` lets a typed message skip straight to processing on the
  // first turn instead of recording+transcribing; every turn after that
  // (including a barge-in mid-reply) behaves like the normal voice loop.
  async function runLoop(initialText?: string) {
    let pendingBlob: Blob | null = null;
    let pendingText: string | undefined = initialText;
    while (!stoppedRef.current) {
      let text = pendingText;
      pendingText = undefined;

      if (!text) {
        let blob = pendingBlob;
        pendingBlob = null;

        if (!blob) {
          setPhase("listening");
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
        }

        setPhase("processing");
        const form = new FormData();
        form.append("audio", blob, "voice.webm");
        try {
          const res = await fetch("/api/assistant/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (res.ok) text = (data.text ?? "").trim();
        } catch {
          // coba lagi dari listening
        }
        if (stoppedRef.current) break;
        if (!text) continue;
      } else {
        setPhase("processing");
      }

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
        pendingBlob = await speakWithBargeIn(reply);
      } catch {
        // gagal ngehubungin Aslan, lanjut coba lagi dari listening
      }
    }
    setPhase("idle");
  }

  function toggle() {
    if (stoppedRef.current) {
      stoppedRef.current = false;
      setErrorMsg(null);
      runLoop();
    } else {
      stoppedRef.current = true;
      audioRef.current?.pause();
      setPhase("idle");
    }
  }

  // For the text input — ignored if a conversation is already active so it
  // doesn't stomp on an in-progress voice turn.
  function sendText(message: string) {
    const trimmed = message.trim();
    if (!trimmed || !stoppedRef.current) return;
    stoppedRef.current = false;
    setErrorMsg(null);
    runLoop(trimmed);
  }

  return { supported, phase, errorMsg, toggle, sendText, audioRef };
}
