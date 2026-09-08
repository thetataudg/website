// lib/clerkErrors.ts
// The only path from a Clerk failure to words a member reads.
//
// A direct port of `ClerkError.safe` in the iOS app
// (mobileapp/ThetaTau/Services/ClerkClient.swift), deliberately: the two
// clients talk to the same instance and hit the same failures, and a member
// who is told "That code wasn't accepted" on their phone should be told the
// same thing on the website.
//
// Raw Clerk messages and trace identifiers never reach a screen. They are
// written for developers, they name internals, and a few of them distinguish
// "no such account" from "wrong password" — which tells an attacker which
// emails are real.

/// Clerk's client SDK throws an error carrying an `errors` array.
type ClerkApiError = {
  errors?: Array<{ code?: string; message?: string; longMessage?: string }>;
};

export const AUTH_MESSAGES = {
  signInFailed:
    "We couldn't sign you in. Check your email and password and try again.",
  socialSignInFailed: "We couldn't complete Google sign-in. Please try again.",
  codeIncorrect: "That code wasn't accepted. Check the code and try again.",
  codeUnavailable: "We couldn't send a verification code. Please try again.",
  tooManyAttempts: "Too many attempts. Wait a moment, then try again.",
  networkUnavailable: "Check your internet connection and try again.",
  passwordTooWeak:
    "That password is too easy to guess. Try a longer one with a mix of characters.",
  incomplete: "We couldn't complete sign-in. Please try again.",
  generic: "Something went wrong. Please try again.",
} as const;

function codesOf(error: unknown): string[] {
  const errors = (error as ClerkApiError)?.errors;
  if (!Array.isArray(errors)) return [];
  return errors
    .map((entry) => String(entry?.code ?? "").toLowerCase())
    .filter(Boolean);
}

export function authErrorMessage(
  error: unknown,
  fallback: string = AUTH_MESSAGES.generic
): string {
  const codes = codesOf(error);

  for (const code of codes) {
    if (code.includes("too_many") || code.includes("rate_limit")) {
      return AUTH_MESSAGES.tooManyAttempts;
    }
    if (code.includes("code_incorrect") || code.includes("verification_failed")) {
      return AUTH_MESSAGES.codeIncorrect;
    }
    if (code.includes("expired")) {
      return "That code has expired. Send a new one and try again.";
    }
    if (code.includes("pwned") || code.includes("password_validation")) {
      return AUTH_MESSAGES.passwordTooWeak;
    }
    // Grouped on purpose. Clerk distinguishes "no such identifier" from "wrong
    // password"; repeating that distinction turns the form into a tool for
    // discovering which brothers have accounts.
    if (
      code.includes("password") ||
      code.includes("identifier") ||
      code.includes("not_found")
    ) {
      return AUTH_MESSAGES.signInFailed;
    }
  }

  if (
    typeof navigator !== "undefined" &&
    "onLine" in navigator &&
    navigator.onLine === false
  ) {
    return AUTH_MESSAGES.networkUnavailable;
  }
  if (error instanceof TypeError) {
    // fetch() rejects with a TypeError when the request never reached Clerk.
    return AUTH_MESSAGES.networkUnavailable;
  }

  return fallback;
}
