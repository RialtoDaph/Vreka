// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRealtimeEvent, startRealtimeSession } from "./realtimeVoice";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("handleRealtimeEvent", () => {
  it("forwards a completed user transcript", () => {
    const onUserTranscript = vi.fn();
    handleRealtimeEvent(
      { type: "conversation.item.input_audio_transcription.completed", transcript: "ganti mode ke fokus" },
      { onUserTranscript }
    );
    expect(onUserTranscript).toHaveBeenCalledWith("ganti mode ke fokus");
  });

  it("forwards a completed assistant transcript", () => {
    const onAssistantTranscriptDone = vi.fn();
    handleRealtimeEvent(
      { type: "response.audio_transcript.done", transcript: "Oke siap!" },
      { onAssistantTranscriptDone }
    );
    expect(onAssistantTranscriptDone).toHaveBeenCalledWith("Oke siap!");
  });

  it("maps turn-taking events to their handlers", () => {
    const onSpeechStarted = vi.fn();
    const onResponseStarted = vi.fn();
    const onResponseDone = vi.fn();
    handleRealtimeEvent({ type: "input_audio_buffer.speech_started" }, { onSpeechStarted });
    handleRealtimeEvent({ type: "response.created" }, { onResponseStarted });
    handleRealtimeEvent({ type: "response.done" }, { onResponseDone });
    expect(onSpeechStarted).toHaveBeenCalledTimes(1);
    expect(onResponseStarted).toHaveBeenCalledTimes(1);
    expect(onResponseDone).toHaveBeenCalledTimes(1);
  });

  it("extracts the error message from an error event", () => {
    const onError = vi.fn();
    handleRealtimeEvent({ type: "error", error: { message: "session expired" } }, { onError });
    expect(onError).toHaveBeenCalledWith("session expired");
  });

  it("ignores unknown event types without throwing", () => {
    expect(() => handleRealtimeEvent({ type: "something.else" }, {})).not.toThrow();
  });
});

describe("startRealtimeSession", () => {
  function mockPeerConnection() {
    const senders: Array<{ track: { stop: ReturnType<typeof vi.fn> } }> = [];
    const dc = { onmessage: null as ((e: MessageEvent) => void) | null, close: vi.fn() };
    const pc = {
      addTrack: vi.fn((track: { stop: ReturnType<typeof vi.fn> }) => {
        senders.push({ track });
      }),
      createDataChannel: vi.fn(() => dc),
      createOffer: vi.fn().mockResolvedValue({ sdp: "fake-offer-sdp" }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      getSenders: vi.fn(() => senders),
      close: vi.fn(),
      ontrack: null as ((e: { streams: MediaStream[] }) => void) | null,
    };
    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn(function RTCPeerConnectionMock() {
        return pc;
      })
    );
    return { pc, dc };
  }

  function mockMic() {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    return { stop };
  }

  it("mints a session, exchanges SDP, and resolves a stop handle", async () => {
    const { pc } = mockPeerConnection();
    mockMic();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      void init;
      if (url === "/api/assistant/realtime-session") {
        return Promise.resolve({ ok: true, json: async () => ({ clientSecret: "ek_test", model: "gpt-realtime-2.1-mini" }) });
      }
      if (url === "https://api.openai.com/v1/realtime/calls") {
        return Promise.resolve({ ok: true, text: async () => "fake-answer-sdp" });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const audioEl = document.createElement("audio");
    const session = await startRealtimeSession(audioEl, {});

    expect(pc.setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: "fake-answer-sdp" });
    expect(typeof session.stop).toBe("function");

    const sdpCall = fetchMock.mock.calls.find((c) => c[0] === "https://api.openai.com/v1/realtime/calls");
    expect((sdpCall?.[1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer ek_test" });
  });

  it("throws when the session-minting route fails, without touching WebRTC", async () => {
    const { pc } = mockPeerConnection();
    mockMic();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "OPENAI_API_KEY belum di-set." }) })
    );

    const audioEl = document.createElement("audio");
    await expect(startRealtimeSession(audioEl, {})).rejects.toThrow("OPENAI_API_KEY belum di-set.");
    expect(pc.createOffer).not.toHaveBeenCalled();
  });

  it("tears down the peer connection and mic if the SDP exchange fails", async () => {
    const { pc } = mockPeerConnection();
    const { stop: micStop } = mockMic();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/assistant/realtime-session") {
          return Promise.resolve({ ok: true, json: async () => ({ clientSecret: "ek_test" }) });
        }
        return Promise.resolve({ ok: false, status: 400, text: async () => "bad sdp" });
      })
    );

    const audioEl = document.createElement("audio");
    await expect(startRealtimeSession(audioEl, {})).rejects.toThrow(/Gagal konek/);
    expect(pc.close).toHaveBeenCalledTimes(1);
    expect(micStop).toHaveBeenCalledTimes(1);
  });

  it("routes incoming data-channel events through handleRealtimeEvent", async () => {
    const { dc } = mockPeerConnection();
    mockMic();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/assistant/realtime-session") {
          return Promise.resolve({ ok: true, json: async () => ({ clientSecret: "ek_test" }) });
        }
        return Promise.resolve({ ok: true, text: async () => "answer-sdp" });
      })
    );

    const onUserTranscript = vi.fn();
    const audioEl = document.createElement("audio");
    await startRealtimeSession(audioEl, { onUserTranscript });

    dc.onmessage?.({
      data: JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "halo" }),
    } as MessageEvent);

    expect(onUserTranscript).toHaveBeenCalledWith("halo");
  });

  // Regression: the model's spoken reply connected successfully but never
  // actually played, since setting `srcObject` alone doesn't auto-play in
  // browsers -- reported as "aku ngomong tapi gak ada respon" in production.
  it("plays the remote audio stream once a track arrives", async () => {
    const { pc } = mockPeerConnection();
    mockMic();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/assistant/realtime-session") {
          return Promise.resolve({ ok: true, json: async () => ({ clientSecret: "ek_test" }) });
        }
        return Promise.resolve({ ok: true, text: async () => "answer-sdp" });
      })
    );

    const audioEl = document.createElement("audio");
    const playSpy = vi.spyOn(audioEl, "play").mockResolvedValue(undefined);
    await startRealtimeSession(audioEl, {});

    const fakeStream = {} as MediaStream;
    pc.ontrack?.({ streams: [fakeStream] });

    expect(audioEl.srcObject).toBe(fakeStream);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});
