// Model IDs are env-overridable so a naming drift on OpenAI's side is a
// one-line config fix instead of a redeploy.
export const TTS_MODEL_ID = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
export const TTS_VOICE = process.env.OPENAI_TTS_VOICE || "alloy";
// "gpt-transcribe" (OpenAI's newest transcription model, released Jul 2026)
// was 500-ing every request in production -- likely staged/restricted access
// this soon after release. whisper-1 is the long-established, universally
// available transcription model, so it's the safer default until the newer
// model's rollout is confirmed open on this account.
export const STT_MODEL_ID = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";

export function getOpenAiApiKey(): string | null {
  return process.env.OPENAI_API_KEY || null;
}

// Chat replies are free-form markdown ("**bold**", "# heading", "- item",
// "1. item", `code`) and id-ID-formatted numbers ("1.234,56") -- TTS engines
// have no markdown awareness, so they read the raw syntax characters aloud
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
