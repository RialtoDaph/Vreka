// Single source of truth for the brand palette. tailwind.config.ts reads
// from this (so `text-cyan-glow` etc. stay in sync), and so does
// components/dashboard/MemoryMap.tsx's Three.js scene -- Three.js can't use
// Tailwind classes, so without a shared source it previously hand-copied
// these hex values and silently drifted whenever the palette changed in
// one place but not the other.
export const THEME = {
  void: "#05080d",
  panel: "#0b1220",
  panel2: "#0f1a2c",
  line: "#1c2b40",
  cyanGlow: "#4be8ff",
  amberGlow: "#ffb454",
  roseGlow: "#ff5d7a",
  mintGlow: "#4bffb0",
  violetGlow: "#b98bff",
  // Not part of the brand accents, but reused verbatim across MemoryMap.tsx
  // for neutral/inactive UI (matches Tailwind's default slate-400). Also
  // replaces a second, arbitrary "#a8b8c8" that used to sit right next to
  // this one for the same purpose and matched no token at all.
  neutral400: "#94a3b8",
} as const;
