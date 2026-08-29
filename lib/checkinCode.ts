import { createHmac, randomBytes } from "crypto";

const WINDOW_SECONDS = 60;
const DEFAULT_SECRET = "default-checkin-secret";
const WALLET_TOKEN_PREFIX = "wallet-v1";

function getSecret() {
  return (
    process.env.CHECKIN_CODE_SECRET ||
    process.env.INVITE_SECRET ||
    DEFAULT_SECRET
  );
}

function base64UrlEncode(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(memberId: string, window: number) {
  const secret = getSecret();
  const hmac = createHmac("sha256", secret);
  hmac.update(`${memberId}|${window}`);
  return base64UrlEncode(hmac.digest());
}

function signWalletToken(memberId: string) {
  const secret =
    process.env.WALLET_PASS_SECRET ||
    process.env.CHECKIN_CODE_SECRET ||
    process.env.INVITE_SECRET ||
    DEFAULT_SECRET;
  const hmac = createHmac("sha256", secret);
  hmac.update(`${WALLET_TOKEN_PREFIX}|${memberId}`);
  return base64UrlEncode(hmac.digest());
}

function parseCode(code: string) {
  const parts = code.split("|");
  if (parts.length !== 3) return null;
  const [memberId, windowStr, signature] = parts;
  if (!memberId || !windowStr || !signature) return null;
  const window = Number(windowStr);
  if (Number.isNaN(window)) return null;
  return { memberId, window, signature };
}

function getWindowForTime(timeMs = Date.now()) {
  return Math.floor(timeMs / 1000 / WINDOW_SECONDS);
}

export function generateCheckInCode(memberId: string) {
  const window = getWindowForTime();
  const signature = sign(memberId, window);
  const expiresAt = (window + 1) * WINDOW_SECONDS * 1000;
  return {
    code: `${memberId}|${window}|${signature}`,
    window,
    expiresAt,
  };
}

export function verifyCheckInCode(code: string) {
  const parsed = parseCode(code);
  if (!parsed) return null;
  const { memberId, window, signature } = parsed;
  const currentWindow = getWindowForTime();
  if (window !== currentWindow) return null;
  if (sign(memberId, window) !== signature) return null;
  return { memberId, window };
}

export function generateWalletPassToken(memberId: string) {
  return `${WALLET_TOKEN_PREFIX}|${memberId}|${signWalletToken(memberId)}`;
}

export function verifyWalletPassToken(code: string) {
  const parts = code.split("|");
  if (parts.length !== 3) return null;
  const [prefix, memberId, signature] = parts;
  if (prefix !== WALLET_TOKEN_PREFIX || !memberId || !signature) return null;
  if (signWalletToken(memberId) !== signature) return null;
  return { memberId, type: "wallet" as const };
}

export function verifyAnyCheckInToken(code: string) {
  const rotating = verifyCheckInCode(code);
  if (rotating) {
    return { memberId: rotating.memberId, type: "rotating" as const };
  }

  return verifyWalletPassToken(code);
}

/**
 * A token for one physical NFC check-in tag.
 *
 * Deliberately opaque and stored, rather than signed like the codes above. A
 * signature can only be revoked by rotating the secret, which would kill every
 * member's QR at the same time; a stored token dies the instant the tag is
 * rewritten, which is exactly the lifetime an officer expects when they point
 * a tag at tomorrow's event.
 *
 * 18 bytes so the whole URL — https://ttdg.org/c/<token> — stays around 45
 * bytes, well inside the 144 bytes of user memory on the NTAG213s these tags
 * usually are.
 */
export function generateBoothToken() {
  return base64UrlEncode(randomBytes(18));
}

/**
 * Where a check-in tag points.
 *
 * Short on purpose: this whole string has to fit in tag memory, and "/c/" is
 * two characters that a tag doesn't have to spend on "/check-in/".
 */
export function boothUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://ttdg.org";
  return `${base.replace(/\/$/, "")}/c/${token}`;
}
