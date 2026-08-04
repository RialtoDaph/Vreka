// Wires a browser WebRTC connection directly to OpenAI's Realtime API for
// Mode Santai's voice-to-voice experience. This bypasses Vreka's own
// /api/assistant/speak and /api/assistant/transcribe entirely (those back
// the turn-based modes) -- once connected, mic audio flows straight to
// OpenAI and its spoken reply flows straight back over WebRTC media, with
// no server round-trip per turn.
//
// Wire protocol (current as of this writing -- verify against OpenAI's own
// Realtime API docs if anything here throws unexpectedly, since none of
// this could be exercised against a live OpenAI key while building it):
//   1. POST /api/assistant/realtime-session -> { clientSecret, model }
//   2. Local RTCPeerConnection: add mic track, create an "oai-events" data
//      channel, createOffer()/setLocalDescription().
//   3. POST the offer SDP (raw, not JSON) to
//      https://api.openai.com/v1/realtime/calls with
//      `Authorization: Bearer <clientSecret>` -- the response body is the
//      answer SDP (also raw text).
//   4. setRemoteDescription(answer). Audio now flows automatically; the
//      data channel carries JSON events (transcripts, turn-taking, errors).
export type RealtimeEventHandlers = {
  onUserTranscript?: (text: string) => void;
  onAssistantTranscriptDone?: (text: string) => void;
  onSpeechStarted?: () => void;
  onResponseStarted?: () => void;
  onResponseDone?: () => void;
  onError?: (message: string) => void;
};

export type RealtimeSession = {
  stop: () => void;
};

export function handleRealtimeEvent(payload: Record<string, unknown>, handlers: RealtimeEventHandlers): void {
  switch (payload.type) {
    case "conversation.item.input_audio_transcription.completed": {
      if (typeof payload.transcript === "string") handlers.onUserTranscript?.(payload.transcript);
      break;
    }
    case "response.audio_transcript.done": {
      if (typeof payload.transcript === "string") handlers.onAssistantTranscriptDone?.(payload.transcript);
      break;
    }
    case "input_audio_buffer.speech_started":
      handlers.onSpeechStarted?.();
      break;
    case "response.created":
      handlers.onResponseStarted?.();
      break;
    case "response.done":
      handlers.onResponseDone?.();
      break;
    case "error": {
      const message = (payload.error as { message?: string } | undefined)?.message;
      handlers.onError?.(message ?? "Realtime session error.");
      break;
    }
    default:
      break;
  }
}

export async function startRealtimeSession(
  audioEl: HTMLAudioElement,
  handlers: RealtimeEventHandlers
): Promise<RealtimeSession> {
  const sessionRes = await fetch("/api/assistant/realtime-session", { method: "POST" });
  if (!sessionRes.ok) {
    const data = await sessionRes.json().catch(() => null);
    throw new Error(data?.error ?? "Gagal bikin sesi realtime.");
  }
  const { clientSecret } = await sessionRes.json();
  if (typeof clientSecret !== "string") {
    throw new Error("Sesi realtime nggak lengkap.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const pc = new RTCPeerConnection();
  stream.getTracks().forEach((track) => pc.addTrack(track, stream));

  pc.ontrack = (event) => {
    audioEl.srcObject = event.streams[0] ?? null;
  };

  const dc = pc.createDataChannel("oai-events");
  dc.onmessage = (event) => {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    handleRealtimeEvent(payload, handlers);
  };

  function teardown() {
    dc.close();
    pc.close();
    stream.getTracks().forEach((track) => track.stop());
  }

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
      body: offer.sdp,
    });
    if (!sdpRes.ok) {
      throw new Error(`Gagal konek ke OpenAI Realtime (${sdpRes.status}).`);
    }
    const answerSdp = await sdpRes.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  } catch (err) {
    teardown();
    throw err;
  }

  return { stop: teardown };
}
