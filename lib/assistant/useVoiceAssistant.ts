"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_ASLAN_MODE, detectModeCommand, getAslanMode, isValidAslanMode, type AslanModeId } from "@/lib/assistant/modes";
import { startRealtimeSession } from "@/lib/assistant/realtimeVoice";

const MODE_STORAGE_KEY = "vreka-assistant-mode";
const SILENCE_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 900;
const MIN_SPEECH_MS = 400;
const MAX_RECORD_MS = 20000;
// Require the mic level to stay above SILENCE_THRESHOLD for this long before
// treating it as the start of real speech — a single loud sample (a click, a
// keyboard tap, a cough) used to be enough to arm the recorder, which is why
// it kept "hearing" things that were never said.
const SPEECH_CONFIRM_MS = 250;
// Barge-in: shorter confirm window than SPEECH_CONFIRM_MS so cutting in feels
// immediate, while still ignoring brief clicks/coughs.
const BARGE_IN_CONFIRM_MS = 300;

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

// Web Speech API's continuous-recognition interface isn't in lib.dom.d.ts --
// only the bits used for passive wake-word listening are typed here.
interface MinimalSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => MinimalSpeechRecognition;

const WAKE_PHRASE = "aslan";

export type VoicePhase = "idle" | "wake-listening" | "listening" | "processing" | "speaking" | "error";

export type UseVoiceAssistantOptions = {
  // Called right before each turn-based chat request goes out, so a caller
  // with an active screen-share (currently only the Memory Map) can attach
  // a fresh snapshot to that turn. Not consulted by the Realtime engine --
  // Santai's live voice call has no per-turn request to attach an image to.
  getScreenshot?: () => string | undefined;
};

/**
 * Shared state machine behind talking to Aslan — used by both the Memory
 * Map's toolbar/radial voice dial and (indirectly) anywhere else Aslan's
 * voice is wired up, so there's one source of truth for mic/TTS/barge-in
 * behavior instead of competing copies.
 */
export function useVoiceAssistant(options: UseVoiceAssistantOptions = {}) {
  const { getScreenshot } = options;
  const [supported, setSupported] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Aslan's replies only ever got spoken aloud -- nothing rendered them as
  // text, so a muted/unheard reply looked exactly like nothing happened at
  // all. Exposed so callers (the Memory Map's voice dial) can show a caption.
  const [lastReply, setLastReply] = useState<string | null>(null);

  const stoppedRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const modeRef = useRef<AslanModeId>(DEFAULT_ASLAN_MODE);
  // Mirrors modeRef for display purposes — components render off state (not
  // a ref) so they actually re-render when the active mode changes. This is
  // the single source of truth for "which mode is active" -- callers (the
  // Aslan page's mode buttons, voice command detection below) all go
  // through `setMode` so an in-progress voice call picks up a change
  // immediately instead of only on the next hook mount.
  const [mode, setModeState] = useState<AslanModeId>(DEFAULT_ASLAN_MODE);

  function setMode(next: AslanModeId) {
    modeRef.current = next;
    setModeState(next);
    window.localStorage.setItem(MODE_STORAGE_KEY, next);
  }

  const [handsFreeSupported, setHandsFreeSupported] = useState(false);
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  // Mirrors handsFreeMode inside callbacks (recognition event handlers,
  // runLoop) that close over stale state otherwise.
  const handsFreeModeRef = useRef(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

  // Which engine the *currently active* call is using -- decided once when
  // the call starts (from the mode active at that moment) so a mode command
  // heard mid-call doesn't leave toggle()'s stop logic guessing which
  // teardown path applies.
  const activeVoiceEngineRef = useRef<"realtime" | "turnbased">("turnbased");
  const realtimeStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setSupported(
      typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia
    );
    setHandsFreeSupported(!!getSpeechRecognitionCtor());
    const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (isValidAslanMode(saved)) {
      modeRef.current = saved;
      setModeState(saved);
    }
    return () => {
      stoppedRef.current = true;
      realtimeStopRef.current?.();
      recognitionRef.current?.stop();
    };
  }, []);

  function getAudioContextCtor() {
    return (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    );
  }

  function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }

  // Passively listens for "aslan" without sending any audio to the server --
  // only once the wake phrase is heard does the normal record/transcribe
  // loop (and its server round-trips) kick in.
  function startWakeListening() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "id-ID";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = (event.results[i][0]?.transcript ?? "").toLowerCase();
        if (transcript.includes(WAKE_PHRASE)) {
          recognitionRef.current = null;
          recognition.stop();
          stoppedRef.current = false;
          setErrorMsg(null);
          setLastReply(null);
          startActiveCall();
          return;
        }
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      recognitionRef.current = null;
      handsFreeModeRef.current = false;
      setHandsFreeMode(false);
      setErrorMsg("Wake-word listening kena error. Coba nyalain lagi mode hands-free.");
      setPhase("error");
    };
    recognition.onend = () => {
      // Some browsers auto-stop continuous recognition after a bit of
      // silence -- restart it as long as we're still meant to be passively
      // listening (and haven't already moved into an active conversation).
      if (recognitionRef.current === recognition && handsFreeModeRef.current && stoppedRef.current) {
        try {
          recognition.start();
        } catch {
          // already started / not restartable -- drop it silently
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setPhase("wake-listening");
    } catch {
      recognitionRef.current = null;
    }
  }

  function toggleHandsFree() {
    if (!handsFreeModeRef.current) {
      handsFreeModeRef.current = true;
      setHandsFreeMode(true);
      if (stoppedRef.current) startWakeListening();
    } else {
      handsFreeModeRef.current = false;
      setHandsFreeMode(false);
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition?.stop();
      if (stoppedRef.current) setPhase("idle");
    }
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
      let voiceStart: number | null = null;
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
          silenceStart = null;
          if (!hasSpoken) {
            if (voiceStart === null) voiceStart = Date.now();
            else if (Date.now() - voiceStart > SPEECH_CONFIRM_MS) hasSpoken = true;
          }
        } else {
          // Dropped back below the threshold before the confirm window
          // elapsed — that was a blip, not the start of speech.
          voiceStart = null;
          if (hasSpoken && elapsed > MIN_SPEECH_MS) {
            if (silenceStart === null) silenceStart = Date.now();
            else if (Date.now() - silenceStart > SILENCE_DURATION_MS) {
              recorder.stop();
              return;
            }
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

      // An explicit spoken command ("ganti mode ke fokus") switches modes
      // right here instead of being forwarded to the chat API as a real
      // question -- confirmed with a short spoken reply, then straight back
      // to listening for whatever the user actually wants to ask.
      const commandedMode = detectModeCommand(text);
      if (commandedMode) {
        setMode(commandedMode);
        if (stoppedRef.current) break;
        setPhase("speaking");
        pendingBlob = await speakWithBargeIn(`Oke, mode ${getAslanMode(commandedMode).label} aktif.`);
        if (getAslanMode(commandedMode).voiceEngine === "realtime") {
          // Hand off to the realtime engine instead of continuing this
          // turn-based loop -- exits cleanly, runRealtimeLoop() takes over.
          activeVoiceEngineRef.current = "realtime";
          runRealtimeLoop();
          return;
        }
        continue;
      }

      try {
        // Grabbed fresh per turn (not once when sharing starts) so Aslan
        // always sees whatever's on screen right now, not a stale frame.
        const image = getScreenshot?.();
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, mode: modeRef.current, image }),
        });
        const reply = res.ok ? await res.text() : "Maaf, ada masalah pas mikir.";
        if (stoppedRef.current) break;
        setLastReply(reply);
        setPhase("speaking");
        pendingBlob = await speakWithBargeIn(reply);
      } catch {
        // gagal ngehubungin Aslan, lanjut coba lagi dari listening
      }
    }
    // Only this trailing block (not toggle()'s stop branch) decides the
    // post-conversation phase, since toggle() only flips stoppedRef and the
    // while loop above may still be mid-await when that happens -- deciding
    // it in two places would race.
    if (handsFreeModeRef.current) {
      startWakeListening();
    } else {
      setPhase("idle");
    }
  }

  // OpenAI's Realtime API is audio-native end-to-end (no separate
  // transcribe/chat/speak steps) -- Mode Santai's voice call runs through
  // this instead of runLoop(). See lib/assistant/realtimeVoice.ts for the
  // actual WebRTC wiring; this just maps its events onto the same
  // phase/errorMsg/lastReply state runLoop() uses so the rest of the app
  // (the call UI, the Memory Map dial) can't tell which engine is live.
  async function runRealtimeLoop() {
    const audio = audioRef.current;
    if (!audio) {
      setErrorMsg("Nggak ada elemen audio buat mode realtime.");
      setPhase("error");
      stoppedRef.current = true;
      return;
    }
    setPhase("listening");
    try {
      const session = await startRealtimeSession(audio, {
        onUserTranscript: (text) => {
          const commandedMode = detectModeCommand(text);
          // Switching to a different mode tears down the realtime
          // connection and falls back to the turn-based loop under that
          // mode -- saying "mode santai" while already in Santai is a
          // no-op, there's nothing to hand off to.
          if (commandedMode && commandedMode !== "santai") {
            realtimeStopRef.current?.();
            realtimeStopRef.current = null;
            setMode(commandedMode);
            activeVoiceEngineRef.current = "turnbased";
            stoppedRef.current = false;
            runLoop();
          }
        },
        onAssistantTranscriptDone: (text) => setLastReply(text),
        onSpeechStarted: () => setPhase("listening"),
        onResponseStarted: () => setPhase("speaking"),
        onResponseDone: () => setPhase("listening"),
        onError: (message) => {
          realtimeStopRef.current = null;
          setErrorMsg(message);
          setPhase("error");
          stoppedRef.current = true;
        },
      });
      if (stoppedRef.current) {
        // toggle() was clicked to stop while the session was still
        // connecting -- tear it straight back down instead of leaving a
        // live call the rest of the hook no longer knows about.
        session.stop();
        return;
      }
      realtimeStopRef.current = session.stop;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal mulai mode realtime.");
      setPhase("error");
      stoppedRef.current = true;
    }
  }

  // Single entry point for starting a call -- picks the engine from
  // whichever mode is active *right now*. `initialText` (a typed message)
  // always goes through the turn-based path: Realtime is specifically the
  // live voice-call experience, and typed messages already work fine
  // through the normal chat API regardless of mode.
  function startActiveCall(initialText?: string) {
    if (!initialText && getAslanMode(modeRef.current).voiceEngine === "realtime") {
      activeVoiceEngineRef.current = "realtime";
      runRealtimeLoop();
    } else {
      activeVoiceEngineRef.current = "turnbased";
      runLoop(initialText);
    }
  }

  function toggle() {
    if (stoppedRef.current) {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition?.stop();
      stoppedRef.current = false;
      setErrorMsg(null);
      setLastReply(null);
      startActiveCall();
    } else {
      stoppedRef.current = true;
      audioRef.current?.pause();
      if (activeVoiceEngineRef.current === "realtime") {
        realtimeStopRef.current?.();
        realtimeStopRef.current = null;
        setPhase(handsFreeModeRef.current ? "wake-listening" : "idle");
        if (handsFreeModeRef.current) startWakeListening();
      }
    }
  }

  // For the text input — ignored if a conversation is already active so it
  // doesn't stomp on an in-progress voice turn.
  function sendText(message: string) {
    const trimmed = message.trim();
    if (!trimmed || !stoppedRef.current) return;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.stop();
    stoppedRef.current = false;
    setErrorMsg(null);
    setLastReply(null);
    startActiveCall(trimmed);
  }

  return {
    supported,
    phase,
    errorMsg,
    toggle,
    sendText,
    audioRef,
    mode,
    setMode,
    lastReply,
    handsFreeSupported,
    handsFreeMode,
    toggleHandsFree,
  };
}
