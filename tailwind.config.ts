import type { Config } from "tailwindcss";
import { THEME } from "./lib/theme";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: THEME.void,
        panel: THEME.panel,
        panel2: THEME.panel2,
        line: THEME.line,
        cyan: {
          glow: THEME.cyanGlow,
        },
        amber: {
          glow: THEME.amberGlow,
        },
        rose: {
          glow: THEME.roseGlow,
        },
        mint: {
          glow: THEME.mintGlow,
        },
        violet: {
          glow: THEME.violetGlow,
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
