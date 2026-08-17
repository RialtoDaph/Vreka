"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "vreka-theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

// Pairs with the inline bootstrap script in app/layout.tsx, which reads the
// same localStorage key synchronously before first paint and stamps
// data-theme on <html> -- this provider just picks up that same state on
// mount (no flash) and keeps it reactive afterwards: live system-preference
// changes while "system" is selected, and immediate updates when the user
// flips the toggle.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const pref: ThemePreference = stored === "light" || stored === "dark" ? stored : "system";
    setPreferenceState(pref);
    setResolvedTheme(pref === "system" ? resolveSystemTheme() : pref);
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    function onChange() {
      setResolvedTheme(resolveSystemTheme());
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    // The static <meta name="theme-color"> in app/layout.tsx only tracks OS
    // preference (it can't read localStorage) -- keep it in sync here too
    // so an explicit in-app choice also colors the mobile browser chrome.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolvedTheme === "light" ? "#eef1f7" : "#05080d");
  }, [resolvedTheme]);

  function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    setResolvedTheme(next === "system" ? resolveSystemTheme() : next);
    if (next === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() dipanggil di luar <ThemeProvider>.");
  return ctx;
}
