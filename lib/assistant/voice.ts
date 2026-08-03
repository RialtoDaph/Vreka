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

// Chat replies are free-form markdown ("**bold**", "# heading", "- item",
// "1. item", `code`) and id-ID-formatted numbers ("1.234,56") -- ElevenLabs
// has no markdown awareness, so it reads the raw syntax characters aloud
// ("asterisk asterisk", "dash", "one dot") instead of treating them as
// formatting. This strips that syntax down to plain prose and rewrites
// grouped numbers into a form TTS reads as an actual quantity, before the
// text ever reaches the API.
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, " "))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[ \t]*[-*+]\s+/gm, "")
    .replace(/^[ \t]*(\d+)\.\s+/gm, "$1) ")
    .replace(/[*_#`]/g, "")
    // id-ID/de-DE-style grouped numbers ("1.234.567,89") confuse TTS number
    // reading -- collapse to a plain "1234567.89" it reads as one quantity.
    .replace(/\d{1,3}(?:\.\d{3})+(?:,\d+)?/g, (match) => {
      const [intPart, decPart] = match.split(",");
      const plainInt = intPart.replace(/\./g, "");
      return decPart ? `${plainInt}.${decPart}` : plainInt;
    })
    .replace(/\n+/g, ". ")
    .replace(/\.{2,}/g, ".")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
