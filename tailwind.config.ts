import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#05080d",
        panel: "#0b1220",
        panel2: "#0f1a2c",
        line: "#1c2b40",
        cyan: {
          glow: "#4be8ff",
        },
        amber: {
          glow: "#ffb454",
        },
        rose: {
          glow: "#ff5d7a",
        },
        mint: {
          glow: "#4bffb0",
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
