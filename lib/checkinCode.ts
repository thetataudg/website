import { createHmac } from "crypto";

const WINDOW_SECONDS = 10;
const DEFAULT_SECRET = "default-checkin-secret";

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
