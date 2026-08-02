import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// "George" — a stock premade voice, works well with the multilingual model.
// Override with ELEVENLABS_VOICE_ID to use a different voice from the account.
export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
// Flash v2.5: ~75ms model latency and half the credit cost of Multilingual v2,
// while still covering Indonesian. Built for conversational/agent use cases.
export const TTS_MODEL_ID = "eleven_flash_v2_5";
export const STT_MODEL_ID = "scribe_v1";

export function getElevenLabsClient(): ElevenLabsClient | null {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  return new ElevenLabsClient({ apiKey });
}
