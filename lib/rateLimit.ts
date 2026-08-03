export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

// In-memory fixed-window counter -- intentionally not Redis/Upstash-backed.
// Vreka is single-user (plus one linked Telegram account), so the real risk
// here is a runaway loop or a fat-fingered retry burning paid API calls, not
// a distributed attacker; a per-instance counter that resets on cold start
// is a proportional guard for that threat model without a new external
// dependency. Swap for Upstash Ratelimit if this ever needs to hold across
// concurrent instances.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

export function _resetRateLimitsForTests() {
  buckets.clear();
}
