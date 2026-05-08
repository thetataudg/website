import { createHmac } from "crypto";

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
