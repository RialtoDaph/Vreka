import { THEME } from "@/lib/theme";
import type { AssistantModelId, AssistantProvider } from "@/lib/assistant/models";

export type AslanModeId = "santai" | "fokus" | "intel" | "ultra";

// Matches the existing brand palette's *-glow tokens (lib/theme.ts /
// tailwind.config.ts) so mode colors reuse real, already-compiled Tailwind
// classes instead of introducing new arbitrary hex values that would need
// their own utility classes wired up.
export type AslanModeColorToken = "mint" | "amber" | "rose" | "violet";

export type AslanMode = {
  id: AslanModeId;
  label: string;
  emoji: string;
  colorToken: AslanModeColorToken;
  colorHex: string;
  tagline: string;
  // Appended to the base system prompt to flavor Aslan's personality for
  // this mode -- separate from `primaryModel`, which picks the actual brain.
  persona: string;
  primaryProvider: AssistantProvider;
  primaryModel: AssistantModelId;
  // Only "santai" is "realtime" -- OpenAI's Realtime API is audio-native and
  // can't front another provider's text output, so every other mode keeps
  // the turn-based record -> transcribe -> chat -> speak pipeline (using
  // OpenAI's separate STT/TTS endpoints as a utility, not as its "brain").
  voiceEngine: "realtime" | "turnbased";
  // Tool-delegation target: the primary model can call a `consult_*` tool to
  // pull in a second opinion / grounded search from this provider instead of
  // running two brains every turn. Only Claude-backed modes get Vreka's full
  // tool set (nyatet transaksi/tugas/dst) -- this consult tool is the one
  // exception available to non-Claude primaries.
  secondaryProvider?: AssistantProvider;
  secondaryModel?: AssistantModelId;
};

export const ASLAN_MODES: readonly AslanMode[] = [
  {
    id: "santai",
    label: "Santai",
    emoji: "🟢",
    colorToken: "mint",
    colorHex: THEME.mintGlow,
    tagline: "Ngobrol santai, suara real-time",
    persona:
      "Mode SANTAI lagi aktif: gaya ngobrol kamu santai, ramah, bahasa kasual sehari-hari -- kayak lagi ngobrol sama temen deket. Jangan kaku atau kelewat formal.",
    primaryProvider: "openai",
    primaryModel: "gpt-5.6-sol",
    voiceEngine: "realtime",
    secondaryProvider: "gemini",
    secondaryModel: "gemini-3.6-flash",
  },
  {
    id: "fokus",
    label: "Fokus",
    emoji: "🟡",
    colorToken: "amber",
    colorHex: THEME.amberGlow,
    tagline: "Riset & tren terkini",
    persona:
      "Mode FOKUS lagi aktif: analitis dan berfokus ke pencarian data, tren terkini, dan riset ringkas. Jawaban lebih terstruktur dan berbasis fakta, gak usah banyak basa-basi.",
    primaryProvider: "grok",
    primaryModel: "grok-4.5",
    voiceEngine: "turnbased",
    secondaryProvider: "gemini",
    secondaryModel: "gemini-3.6-flash",
  },
  {
    id: "intel",
    label: "Intel",
    emoji: "🔴",
    colorToken: "rose",
    colorHex: THEME.roseGlow,
    tagline: "Coding, arsitektur, logika",
    persona:
      "Mode INTEL lagi aktif: profesional, to-the-point, fokus ke pemecahan masalah, koding, arsitektur sistem, dan logika rumit.",
    primaryProvider: "anthropic",
    primaryModel: "claude-sonnet-5",
    voiceEngine: "turnbased",
  },
  {
    id: "ultra",
    label: "Ultra",
    emoji: "🟣",
    colorToken: "violet",
    colorHex: THEME.violetGlow,
    tagline: "Reasoning terdalam",
    persona:
      "Mode ULTRA lagi aktif: puncak reasoning Aslan -- fokus ke pemecahan masalah logika/matematika paling rumit, arsitektur sistem skala besar, dan analisis dokumen/codebase raksasa. Ambil waktu buat mikir dalam-dalam sebelum jawab, jangan buru-buru.",
    primaryProvider: "gemini",
    primaryModel: "gemini-3.1-pro",
    voiceEngine: "turnbased",
  },
] as const;

// Claude stays the default -- it's the only mode with Vreka's full tool set
// (nyatet transaksi/tugas/dst), so defaulting anywhere else would silently
// take that away from anyone who doesn't manually pick a mode.
export const DEFAULT_ASLAN_MODE: AslanModeId = "intel";

export function isValidAslanMode(value: unknown): value is AslanModeId {
  return ASLAN_MODES.some((m) => m.id === value);
}

export function getAslanMode(id: string): AslanMode {
  return ASLAN_MODES.find((m) => m.id === id) ?? ASLAN_MODES.find((m) => m.id === DEFAULT_ASLAN_MODE)!;
}

// Requires "mode" adjacent to the mode name (either order: "ganti mode ke
// fokus" or "santai mode dong") rather than a bare keyword match -- someone
// casually saying "santai aja sih" mid-conversation shouldn't accidentally
// flip the whole brain.
const MODE_COMMAND_PATTERN = /\bmode\s+(?:ke\s+)?(santai|fokus|intel|ultra)\b|\b(santai|fokus|intel|ultra)\s+mode\b/i;

export function detectModeCommand(text: string): AslanModeId | null {
  const match = MODE_COMMAND_PATTERN.exec(text.toLowerCase());
  const id = match?.[1] ?? match?.[2];
  return id && isValidAslanMode(id) ? id : null;
}
