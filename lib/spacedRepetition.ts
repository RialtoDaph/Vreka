export type ReviewRating = "again" | "hard" | "good" | "easy";

export type ReviewState = {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
};

export type ReviewResult = ReviewState & { due_at: string };

const MIN_EASE = 1.3;

// A lightweight SM-2 variant (the algorithm behind Anki/SuperMemo): every
// review adjusts how "easy" a card is for this specific user (ease_factor)
// and how many days until it's shown again (interval_days) -- cards you
// know well drift further apart, cards you keep missing come back sooner.
export function nextReview(card: ReviewState, rating: ReviewRating, now: Date = new Date()): ReviewResult {
  let { ease_factor: ease, interval_days: interval, repetitions } = card;

  if (rating === "again") {
    // Failed recall resets progress entirely -- due again today rather than
    // trusting a spacing the card just proved it hasn't earned yet.
    repetitions = 0;
    interval = 0;
    ease = Math.max(MIN_EASE, ease - 0.2);
  } else {
    if (rating === "hard") {
      ease = Math.max(MIN_EASE, ease - 0.15);
      interval = repetitions === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
    } else if (rating === "good") {
      interval = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(interval * ease);
    } else {
      ease = ease + 0.15;
      interval = repetitions === 0 ? 2 : repetitions === 1 ? 8 : Math.round(interval * ease * 1.3);
    }
    repetitions += 1;
  }

  const dueAt = new Date(now);
  dueAt.setDate(dueAt.getDate() + interval);

  return {
    ease_factor: Math.round(ease * 100) / 100,
    interval_days: interval,
    repetitions,
    due_at: dueAt.toISOString(),
  };
}
