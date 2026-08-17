// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import FlashcardPanel from "./FlashcardPanel";
import type { Flashcard, StudyNote } from "@/lib/types";

afterEach(() => {
  cleanup();
});

const note = { id: "n1", title: "Bahasa Jerman" } as StudyNote;

const dueCard: Flashcard = {
  id: "c1",
  note_id: "n1",
  user_id: "u1",
  front: "Apa kabar?",
  back: "Wie geht's?",
  ease_factor: 2.5,
  interval_days: 0,
  repetitions: 0,
  due_at: new Date(Date.now() - 1000).toISOString(),
  last_reviewed_at: null,
  created_at: new Date().toISOString(),
};

function renderPanel(cards: Flashcard[] = [dueCard]) {
  return render(
    <FlashcardPanel
      note={note}
      cards={cards}
      onClose={vi.fn()}
      onAdd={vi.fn()}
      onDelete={vi.fn()}
      onGenerate={vi.fn()}
      onSaveGenerated={vi.fn()}
      onRate={vi.fn().mockResolvedValue(dueCard)}
    />
  );
}

describe("FlashcardPanel", () => {
  it("renders the flip card as a real keyboard-accessible button, not a mouse-only div", () => {
    renderPanel();
    fireEvent.click(screen.getByText(/Mulai Review/));

    const card = screen.getByRole("button", { name: "Klik buat balik kartu" });
    expect(card.tagName).toBe("BUTTON");
    expect(screen.getByText("Apa kabar?")).toBeInTheDocument();
  });

  it("flips to show the back and updates its accessible name when clicked", () => {
    renderPanel();
    fireEvent.click(screen.getByText(/Mulai Review/));

    fireEvent.click(screen.getByRole("button", { name: "Klik buat balik kartu" }));

    expect(screen.getByText("Wie geht's?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kartu terbalik/ })).toBeInTheDocument();
  });
});
