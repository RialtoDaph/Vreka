import type { Config } from "tailwindcss";

// Every color here resolves through a CSS custom property (defined for
// both `:root`/[data-theme="dark"] and [data-theme="light"] in
// app/globals.css) instead of a literal hex -- that's what makes
// `bg-panel`, `text-cyan-glow/80`, etc. repaint automatically when the
// theme toggle flips `data-theme` on <html>. The `rgb(var(--x) /
// <alpha-value>)` form is Tailwind's documented pattern for keeping
// opacity modifiers (`/70`, `/50`, ...) working with CSS-var-backed colors.
function themedColor(cssVar: string) {
  return `rgb(var(${cssVar}) / <alpha-value>)`;
}

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: themedColor("--color-void"),
        panel: themedColor("--color-panel"),
        panel2: themedColor("--color-panel2"),
        line: themedColor("--color-line"),
        overlay: themedColor("--color-overlay"),
        fg: {
          DEFAULT: themedColor("--color-fg"),
          secondary: themedColor("--color-fg-secondary"),
          muted: themedColor("--color-fg-muted"),
          subtle: themedColor("--color-fg-subtle"),
        },
        cyan: {
          glow: themedColor("--color-cyan-glow"),
        },
        amber: {
          glow: themedColor("--color-amber-glow"),
        },
        rose: {
          glow: themedColor("--color-rose-glow"),
        },
        mint: {
          glow: themedColor("--color-mint-glow"),
        },
        violet: {
          glow: themedColor("--color-violet-glow"),
        },
      },
      fontFamily: {
        display: ["var(--font-chakra)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
        body: ["var(--font-rajdhani)", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(75,232,255,0.25), 0 0 24px -8px rgba(75,232,255,0.35)",
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(75,232,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(75,232,255,0.06) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};
export default config;
