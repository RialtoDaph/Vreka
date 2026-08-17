// Single source of truth for the brand palette, mirroring the CSS custom
// properties defined in app/globals.css (keep both in sync when a color
// changes -- Tailwind classes read the CSS vars, but a few JS-side
// consumers need an actual color value at runtime instead of a class:
// Three.js can't use Tailwind classes (MemoryMap.tsx / useMemoryMapScene.ts,
// which force Memory Map's immersive 3D scene dark regardless of the
// light/dark toggle -- see MemoryMap.tsx's data-theme="dark" wrapper), and
// Recharts/inline-SVG props that need a literal stroke/fill color instead
// of a className (components/keuangan/AnalyticsTab.tsx,
// app/dashboard/canvas/page.tsx) which pick DARK_THEME or LIGHT_THEME via
// useTheme()'s resolvedTheme.
export const DARK_THEME = {
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
  // for neutral/inactive UI (matches Tailwind's default slate-400).
  neutral400: "#94a3b8",
} as const;

// Same roles, re-tuned for a light surface: the "glow" accents are darkened
// several steps (e.g. cyan-glow #4be8ff -> #0e7490) since the neon-bright
// dark-mode values fall well under WCAG AA contrast on a white background.
export const LIGHT_THEME = {
  void: "#eef1f7",
  panel: "#ffffff",
  panel2: "#f1f4f9",
  line: "#dbe2ec",
  cyanGlow: "#0e7490",
  amberGlow: "#b45309",
  roseGlow: "#be123c",
  mintGlow: "#047857",
  violetGlow: "#6d28d9",
  neutral400: "#64748b",
} as const;

export type ThemePalette = typeof DARK_THEME;

// Memory Map's 3D scene (and its 2D overlay HUD) is always dark, by
// design, no matter what the rest of the app is set to -- an immersive
// "space" view, not a themeable content page. Kept as a plain alias so
// those two files don't need to know about light/dark at all.
export const THEME = DARK_THEME;
