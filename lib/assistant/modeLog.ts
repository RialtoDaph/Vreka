import type { AslanMode, AslanModeColorToken } from "@/lib/assistant/modes";

const ANSI_COLOR: Record<AslanModeColorToken, string> = {
  mint: "\x1b[32m", // green -- santai
  amber: "\x1b[33m", // yellow -- fokus
  rose: "\x1b[31m", // red -- intel
  violet: "\x1b[35m", // magenta -- ultra
};
const ANSI_RESET = "\x1b[0m";

// Vercel's dashboard log viewer strips ANSI escape codes, so the color only
// actually shows up in a local `next dev` terminal -- still plain, readable
// text in production logs either way.
export function logModeRouting(mode: AslanMode, model: string): void {
  const color = ANSI_COLOR[mode.colorToken];
  console.log(`${color}[MODE SWITCH]${ANSI_RESET} -> ${mode.id} | Routing to ${model}`);
}
