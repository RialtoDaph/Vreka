// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ThemeToggle from "./ThemeToggle";
import { ThemeProvider } from "@/components/ThemeProvider";

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("shows Gelap, Terang, and Sistem options with the current preference pressed", async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    expect(await screen.findByText("Gelap")).toBeInTheDocument();
    expect(screen.getByText("Terang")).toBeInTheDocument();
    expect(screen.getByText("Sistem")).toHaveAttribute("aria-pressed", "true");
  });

  it("switching to Terang applies it immediately and persists it", async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    fireEvent.click(await screen.findByText("Terang"));

    expect(screen.getByText("Terang")).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("vreka-theme")).toBe("light");
  });
});
