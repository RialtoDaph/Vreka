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

// --- Indonesian number-to-words -------------------------------------------
// Testing against the real voice showed ElevenLabs doesn't reliably say
// digit strings out loud at all (not just mispronounce them) -- especially
// id-ID-formatted decimals like "45,00" that have no thousands-grouping dot
// to hint they're a number. Spelling every number out as Indonesian words
// before it reaches the API sidesteps that entirely, regardless of the
// underlying cause. This only feeds the TTS request text -- the on-screen
// caption (chat stream / lastReply) is never touched, so what's displayed
// stays as normal digits and symbols.

const ONES = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];
const SCALES = ["", "ribu", "juta", "miliar", "triliun"];

function threeDigitsToWords(n: number): string {
  if (n === 0) return "";
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 1) parts.push("seratus");
  else if (hundreds > 1) parts.push(`${ONES[hundreds]} ratus`);
  if (rest > 0) {
    if (rest < 10) parts.push(ONES[rest]);
    else if (rest < 20) parts.push(rest === 10 ? "sepuluh" : rest === 11 ? "sebelas" : `${ONES[rest - 10]} belas`);
    else {
      const tens = Math.floor(rest / 10);
      const ones = rest % 10;
      parts.push(`${ONES[tens]} puluh${ones > 0 ? ` ${ONES[ones]}` : ""}`);
    }
  }
  return parts.join(" ");
}

// Non-negative integers only -- sign is handled by callers, since currency
// and percent forms wrap it differently ("minus" placement, unit suffix).
function integerToWords(value: number): string {
  if (value === 0) return "nol";
  const groups: number[] = [];
  let n = value;
  while (n > 0) {
    groups.unshift(n % 1000);
    n = Math.floor(n / 1000);
  }
  const parts: string[] = [];
  groups.forEach((group, i) => {
    if (group === 0) return;
    const scale = SCALES[groups.length - 1 - i];
    if (group === 1 && scale === "ribu") parts.push("seribu");
    else parts.push(scale ? `${threeDigitsToWords(group)} ${scale}` : threeDigitsToWords(group));
  });
  return parts.join(" ");
}

// Decimal digits are read one at a time after "koma" ("3,14" -> "tiga koma
// satu empat"), the natural way Indonesian speech reads a non-money decimal
// -- as opposed to money, where the decimal is a cents amount (see below).
function digitsToWords(digits: string): string {
  return digits
    .split("")
    .map((d) => ONES[Number(d)] || "nol")
    .join(" ");
}

function splitIdNumber(raw: string): { negative: boolean; intPart: number; decDigits: string } {
  let s = raw.trim();
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  const [intRaw, decRaw] = s.split(",");
  return { negative, intPart: Number(intRaw.replace(/\./g, "")), decDigits: decRaw ?? "" };
}

function currencyToWords(raw: string): string {
  const { negative, intPart, decDigits } = splitIdNumber(raw);
  const cents = decDigits ? Math.round(Number(`0.${decDigits}`) * 100) : 0;
  const words = [negative ? "minus" : "", integerToWords(intPart), "euro"];
  if (cents > 0) words.push(integerToWords(cents), "sen");
  return words.filter(Boolean).join(" ");
}

function percentToWords(raw: string): string {
  const { negative, intPart, decDigits } = splitIdNumber(raw);
  const words = [negative ? "minus" : "", integerToWords(intPart)];
  if (decDigits) words.push("koma", digitsToWords(decDigits));
  words.push("persen");
  return words.filter(Boolean).join(" ");
}

function genericNumberToWords(raw: string): string {
  const { negative, intPart, decDigits } = splitIdNumber(raw);
  const words = [negative ? "minus" : "", integerToWords(intPart)];
  if (decDigits) words.push("koma", digitsToWords(decDigits));
  return words.filter(Boolean).join(" ");
}

// Matches a properly id-ID-grouped number ("1.234.567,89") OR a plain
// ungrouped run of digits ("2026") -- in that order, so a year or a
// bare quantity isn't chopped at the first 3 digits by the grouped branch.
const ID_NUMBER = String.raw`-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?`;
const CURRENCY_NUMBER = new RegExp(`${ID_NUMBER}\\s*€`, "g");
const PERCENT_NUMBER = new RegExp(`${ID_NUMBER}\\s*%`, "g");
// Not preceded by... actually followed by ")" excludes a numbered-list
// marker ("1) Item", rewritten below) -- that's an ordinal position, not a
// quantity, and reads better left as a digit than as "satu)".
const BARE_NUMBER = new RegExp(`${ID_NUMBER}(?!\\))`, "g");

// Chat replies are free-form markdown ("**bold**", "# heading", "- item",
// "1. item", `code`) -- ElevenLabs has no markdown awareness, so it reads
// the raw syntax characters aloud ("asterisk asterisk", "dash", "one dot")
// instead of treating them as formatting. This strips that syntax down to
// plain prose and spells out numbers/currency/percent as Indonesian words,
// before the text ever reaches the API.
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
    .replace(CURRENCY_NUMBER, (m) => currencyToWords(m.replace(/\s*€$/, "")))
    .replace(PERCENT_NUMBER, (m) => percentToWords(m.replace(/\s*%$/, "")))
    .replace(BARE_NUMBER, (m) => genericNumberToWords(m))
    .replace(/\n+/g, ". ")
    .replace(/\.{2,}/g, ".")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
