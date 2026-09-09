// lib/phone.ts
//
// One canonical shape for a member's phone number: E.164, e.g. "+14805550123".
//
// Storing what the member typed would mean every comparison is a guess. The
// Airtable base alone renders the same number four ways — "480-555-0123",
// "(480) 555-0123", "4805550123", "+1 480 555 0123" — so without a canonical
// form the import preview reports the entire chapter as "changed" on every
// run. Display formatting is a pure function of the stored value, so the web
// and the app can each render it without a second stored column to drift.

export type PhoneNormalizeResult =
  | { ok: true; e164: string | null }
  | { ok: false; error: string };

/// Matched *before* punctuation is stripped. Otherwise "555-0123 x12" quietly
/// becomes a 12-digit number rather than being refused.
const EXTENSION_MARKER = /(?:\bx\b|\bext\b\.?|extension|[,;])/i;

const INVALID_MESSAGE = "That doesn't look like a valid phone number.";

/**
 * Normalizes loose input to E.164.
 *
 * Blank input is `{ ok: true, e164: null }` — "not provided" is a legitimate
 * state (every member predating this field is in it), and is different from
 * "provided, but unusable", which is an error the caller should surface.
 */
export function normalizePhone(input: unknown): PhoneNormalizeResult {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: true, e164: null };

  // Extensions are refused rather than encoded. `;ext=` is legal E.164 but
  // iOS dials it inconsistently, and a chapter directory wants the number that
  // reaches the person directly.
  if (EXTENSION_MARKER.test(raw)) {
    return {
      ok: false,
      error: "Extensions aren't supported. Enter the direct number.",
    };
  }

  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { ok: false, error: INVALID_MESSAGE };

  if (!hasPlus) {
    if (digits.length === 10) return { ok: true, e164: `+1${digits}` };
    if (digits.length === 11 && digits.startsWith("1")) {
      return { ok: true, e164: `+${digits}` };
    }
    return {
      ok: false,
      error: "Enter a 10-digit US number, or include a + and country code.",
    };
  }

  // Already international. E.164 allows up to 15 digits; below 8 is not a
  // dialable subscriber number in any country plan.
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, error: INVALID_MESSAGE };
  }
  return { ok: true, e164: `+${digits}` };
}

/**
 * "+14805550123" -> "(480) 555-0123".
 *
 * Deliberately only understands +1. Anything else is returned as stored, which
 * is already dialable and readable; a full libphonenumber dependency is not
 * worth carrying for a chapter that is almost entirely US numbers.
 */
export function formatPhone(e164: string | null | undefined): string {
  const value = String(e164 ?? "").trim();
  if (!value.startsWith("+1")) return value;

  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return value;

  const n = digits.slice(1);
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
}

/** True when the input yields a usable number. Blank counts as invalid here. */
export function isValidPhone(input: unknown): boolean {
  const result = normalizePhone(input);
  return result.ok && result.e164 !== null;
}
