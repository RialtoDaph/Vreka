"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_ASSISTANT_MODEL, isValidAssistantModel, type AssistantModelId } from "@/lib/assistant/models";

const MODEL_STORAGE_KEY = "vreka-assistant-model";
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

// Short, varied acknowledgements -- only actually spoken when the real
// reply isn't ready in time (see FILLER_GRACE_MS below), so a fast answer
// never gets a bolted-on "uhh" and it doesn't feel like the same canned
// line every turn.
const FILLER_PHRASES_QUICK = [
  "Siap bos, bentar ya aku cariin dulu.",
  "Im on it bos! Ditunggu sebentar ya.",
  "Hmm.. wait bosku, aku lagi cari nih.",
  "Otw jawab bos, dikit lagi.",
  "Sat set dulu ya bos.",
  "Oke bos, otw cek datanya.",
  "Bentar bos, aku liatin dulu.",
];
// If Aslan's first spoken sentence isn't ready within this window --
// typically a tool-calling turn waiting on a DB write or a Gmail/Calendar
// round trip -- a filler clip plays first so the wait doesn't read as dead
// air. Skipped entirely for turns that answer fast enough on their own.
const FILLER_GRACE_MS = 600;

// A second, longer wait (a multi-tool-call chain, a slow Gmail/Calendar
// round trip) used to go dead-silent again once the first filler clip
// finished playing -- this second tier covers that gap with a clip that
// acknowledges the wait is real, instead of repeating the same "hang on".
const FILLER_PHRASES_LONG = [
  "Masih diproses bos, bentar lagi kelar.",
  "Sori bos, ini agak muter dikit datanya.",
  "Dikit lagi bos, lagi aku beresin.",
  "Sabar bos, hampir jadi.",
];
const FILLER_GRACE_MS_LONG = 2800;

// Excludes the just-used phrase (when the pool has an alternative) so two
// consecutive turns don't play the identical clip back to back.
export function pickFiller(pool: string[], avoid: string | null): string {
  const options = avoid && pool.length > 1 ? pool.filter((p) => p !== avoid) : pool;
  return options[Math.floor(Math.random() * options.length)];
}

type AudioQueueItem = Promise<Blob | null>;

// A tiny producer/consumer queue: the chat-stream reader pushes one TTS
// promise per sentence the moment its text is ready, while the player
// consumes them in order -- so sentence 1 can start playing before
// sentence 2's text (let alone its audio) even exists yet.
export function createAudioQueue() {
  const items: AudioQueueItem[] = [];
  let closed = false;
  let wake: (() => void) | null = null;

  function push(item: AudioQueueItem) {
    items.push(item);
    wake?.();
  }
  function close() {
    closed = true;
    wake?.();
  }
  // `yield` on a promise inside an async generator resolves it before
  // handing the value to the `for await` consumer, so this already yields
  // `Blob | null` (not the promise itself) despite `items` holding promises.
  async function* consume(): AsyncGenerator<Blob | null> {
    let i = 0;
    while (true) {
      if (i < items.length) {
        yield items[i];
        i++;
      } else if (closed) {
        return;
      } else {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    }
  }
  return { push, close, consume };
}
type AudioQueue = ReturnType<typeof createAudioQueue>;

// Pulls complete sentences off the front of `buffer` as text streams in, so
// each can go to TTS the moment it's ready instead of waiting for the whole
// reply. A "sentence" ends in ./!/? followed by actual whitespace (so a
// grouped number like "50.000" doesn't get split mid-digit), or a newline
// on its own (which is already the boundary -- text on the very next
// character, with no gap, still counts). Not linguistically perfect (an
// abbreviation like "Rp." can stall a split) but it fails safe: anything
// that never confidently splits just stays buffered and gets flushed as
// one chunk once the stream ends, same as before this existed.
const SENTENCE_BOUNDARY = /^[^.!?\n]*(?:[.!?]+(?:["')\]]*)\s+|\n+)/;
export function extractSentences(buffer: string): { sentences: string[]; remainder: string } {
  const sentences: string[] = [];
  let rest = buffer;
  while (true) {
    const match = SENTENCE_BOUNDARY.exec(rest);
    if (!match) break;
    const piece = match[0];
    if (piece.trim().length < 6) break; // too short to confidently be a real sentence yet
    sentences.push(piece.trim());
    rest = rest.slice(piece.length);
  }
  return { sentences, remainder: rest };
}

async function ttsBlob(text: string, signal: AbortSignal): Promise<Blob | null> {
  try {
    const res = await fetch("/api/assistant/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

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
  // Called right before each chat request goes out, so a caller with an
  // active screen-share (currently only the Memory Map) can attach a fresh
  // snapshot to that turn.
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
  // Persists across turns (not reset per streamReplyIntoQueue call) so the
  // no-immediate-repeat rule in pickFiller() actually spans the conversation.
  const lastFillerRef = useRef<string | null>(null);
  const modelRef = useRef<AssistantModelId>(DEFAULT_ASSISTANT_MODEL);
  // Mirrors modelRef for display purposes — components render off state (not
  // a ref) so they actually re-render when the picked model changes.
  const [model, setModelState] = useState<AssistantModelId>(DEFAULT_ASSISTANT_MODEL);

  function setModel(next: AssistantModelId) {
    modelRef.current = next;
    setModelState(next);
    window.localStorage.setItem(MODEL_STORAGE_KEY, next);
  }

  const [handsFreeSupported, setHandsFreeSupported] = useState(false);
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  // Mirrors handsFreeMode inside callbacks (recognition event handlers,
  // runLoop) that close over stale state otherwise.
  const handsFreeModeRef = useRef(false);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);

  useEffect(() => {
    setSupported(
      typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia
    );
    setHandsFreeSupported(!!getSpeechRecognitionCtor());
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (isValidAssistantModel(saved)) {
      modelRef.current = saved;
      setModelState(saved);
    }
    return () => {
      stoppedRef.current = true;
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
          runLoop();
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

  // Plays each queued reply chunk (maybe a filler, then sentence-by-sentence
  // TTS) in order while listening for an interruption -- same barge-in
  // behavior as before, just spanning a sequence of clips instead of one.
  // Aborts the producer (further chat-stream reading / TTS requests) the
  // moment the user interrupts or the call ends, so nothing keeps
  // generating audio that'll never play.
  async function speakQueueWithBargeIn(
    queue: AudioQueue,
    turnAbort: AbortController
  ): Promise<Blob | null> {
    const audio = audioRef.current;
    if (!audio) return null;
    let spokenAny = false;
    try {
      for await (const blob of queue.consume()) {
        if (stoppedRef.current) return null;
        if (!blob || stoppedRef.current) continue;

        if (!spokenAny) {
          spokenAny = true;
          setPhase("speaking");
        }

        const url = URL.createObjectURL(blob);
        audio.src = url;
        // A play() rejection (autoplay blocked, no supported source, ...) used
        // to be swallowed here -- Aslan's reply would generate fine server-side
        // and then just never make a sound, with nothing telling the user why.
        try {
          await audio.play();
        } catch (err) {
          console.error("Aslan: audio.play() ditolak browser:", err);
          setErrorMsg(
            "Balasan Aslan gagal diputer (browser nolak audio-nya). Coba klik lagi tombol mic-nya."
          );
        }
        const result = await watchForBargeIn(audio);
        URL.revokeObjectURL(url);

        if (result === "interrupted") {
          turnAbort.abort();
          if (!stoppedRef.current) {
            setPhase("listening");
            try {
              return await recordUntilSilence();
            } catch {
              return null;
            }
          }
          return null;
        }
      }
    } finally {
      // No-op if the queue already finished on its own -- only matters for
      // the early returns above (interrupted / stopped mid-loop).
      turnAbort.abort();
    }
    return null;
  }

  // Fetches Aslan's reply as a stream and, as each sentence completes,
  // fires off its TTS conversion immediately and pushes it onto `queue` --
  // so the player above can start speaking sentence 1 while sentence 2 is
  // still being generated, instead of waiting for the whole reply. If
  // nothing is ready within FILLER_GRACE_MS (typically a tool-calling turn
  // waiting on a DB write or a Gmail/Calendar round trip), a short filler
  // clip is queued first so the wait doesn't read as dead air. A longer
  // wait still (a multi-tool-call chain) gets a second, different filler at
  // FILLER_GRACE_MS_LONG instead of going quiet again once the first one
  // finishes playing.
  async function streamReplyIntoQueue(
    text: string,
    image: string | undefined,
    queue: AudioQueue,
    signal: AbortSignal
  ) {
    let firstSentenceArrived = false;
    // Picks a phrase and remembers it (so the *next* turn's pick avoids an
    // immediate repeat), regardless of whether this pick ends up spoken.
    function pickAndRememberFiller(pool: string[]): string {
      const phrase = pickFiller(pool, lastFillerRef.current);
      lastFillerRef.current = phrase;
      return phrase;
    }
    // Fetched immediately so it's already in hand by the time the grace
    // period elapses. The long-tier filler is deliberately *not* prefetched
    // here -- most turns never run long enough to need it, so there's no
    // reason to pay for a second TTS call on every single turn.
    const quickFillerPromise = ttsBlob(pickAndRememberFiller(FILLER_PHRASES_QUICK), signal);
    const quickFillerTimer = setTimeout(() => {
      if (!firstSentenceArrived) queue.push(quickFillerPromise);
    }, FILLER_GRACE_MS);
    const longFillerTimer = setTimeout(() => {
      if (!firstSentenceArrived) {
        queue.push(ttsBlob(pickAndRememberFiller(FILLER_PHRASES_LONG), signal));
      }
    }, FILLER_GRACE_MS_LONG);

    function queueSentence(sentence: string) {
      if (!firstSentenceArrived) {
        firstSentenceArrived = true;
        clearTimeout(quickFillerTimer);
        clearTimeout(longFillerTimer);
      }
      queue.push(ttsBlob(sentence, signal));
    }

    let reply = "";
    let buffer = "";
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, model: modelRef.current, image }),
        signal,
      });
      if (!res.ok || !res.body) {
        reply = "Maaf, ada masalah pas mikir.";
        queueSentence(reply);
        setLastReply(reply);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        reply += chunk;
        buffer += chunk;
        setLastReply(reply);

        const { sentences, remainder } = extractSentences(buffer);
        buffer = remainder;
        for (const sentence of sentences) queueSentence(sentence);
      }

      const last = buffer.trim();
      if (last) queueSentence(last);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (!aborted && !reply) {
        const fallback = "Maaf, ada masalah pas mikir.";
        queueSentence(fallback);
        setLastReply(fallback);
      }
    } finally {
      clearTimeout(quickFillerTimer);
      clearTimeout(longFillerTimer);
      queue.close();
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
        // Grabbed fresh per turn (not once when sharing starts) so Aslan
        // always sees whatever's on screen right now, not a stale frame.
        const image = getScreenshot?.();
        const queue = createAudioQueue();
        const turnAbort = new AbortController();
        // Not awaited -- runs concurrently with speakQueueWithBargeIn below,
        // which is the whole point: sentence 1 can start playing while this
        // is still streaming/speaking sentence 3. Never throws (its own
        // try/catch/finally always resolves), so nothing here needs to
        // await or catch it.
        void streamReplyIntoQueue(text, image, queue, turnAbort.signal);
        pendingBlob = await speakQueueWithBargeIn(queue, turnAbort);
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

  function toggle() {
    if (stoppedRef.current) {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition?.stop();
      stoppedRef.current = false;
      setErrorMsg(null);
      setLastReply(null);
      runLoop();
    } else {
      stoppedRef.current = true;
      audioRef.current?.pause();
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
    runLoop(trimmed);
  }

  return {
    supported,
    phase,
    errorMsg,
    toggle,
    sendText,
    audioRef,
    model,
    setModel,
    lastReply,
    handsFreeSupported,
    handsFreeMode,
    toggleHandsFree,
  };
}
