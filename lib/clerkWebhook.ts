// lib/clerkWebhook.ts
//
// Verifies that a webhook POST really came from Clerk.
//
// Clerk delivers through Svix, whose scheme is a plain HMAC over
// `${svix-id}.${svix-timestamp}.${rawBody}`. Implemented here rather than
// pulling in the `svix` package, matching how the App Store webhook already
// verifies Apple's signature by hand: it is thirty lines and keeps the
// dependency tree where it is.
import crypto from "crypto";

/// How far out of date a timestamp may be before the request is treated as a
/// replay. Svix's own tolerance.
const TOLERANCE_SECONDS = 5 * 60;

export type ClerkWebhookHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export function verifyClerkWebhook(
  rawBody: string,
  headers: ClerkWebhookHeaders,
  secret: string | undefined
): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: "No CLERK_WEBHOOK_SECRET configured" };
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "Missing svix-id, svix-timestamp, or svix-signature" };
  }

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: "Unparseable svix-timestamp" };
  if (Math.abs(Date.now() / 1000 - sent) > TOLERANCE_SECONDS) {
    return { ok: false, reason: "Timestamp outside tolerance" };
  }

  // Secrets are handed out as `whsec_<base64>`; the bytes are what is keyed on.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  // The header carries a space-separated list so keys can be rotated; any one
  // matching is enough.
  const offered = signature
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter(Boolean) as string[];

  const expectedBuf = Buffer.from(expected);
  const matched = offered.some((candidate) => {
    const candidateBuf = Buffer.from(candidate);
    return (
      candidateBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(candidateBuf, expectedBuf)
    );
  });

  return matched ? { ok: true } : { ok: false, reason: "Signature mismatch" };
}
