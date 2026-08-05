// Shared between the client (generating/showing/hashing codes at 2FA
// enrollment) and the server (hashing a submitted code to compare against
// the stored hash) -- Web Crypto's subtle.digest is available in both the
// browser and Next.js's node/edge runtimes, so one implementation covers
// both sides without a new dependency.

// Avoids 0/O/1/I/L -- characters easy to misread when a code is copied by
// hand off a screen or a printed backup sheet.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
export const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const b of bytes) raw += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

// Strips formatting/casing so "ab12c-de34f", "AB12C DE34F", and
// "AB12CDE34F" all hash identically -- users retype these by hand.
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = normalizeRecoveryCode(code);
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
