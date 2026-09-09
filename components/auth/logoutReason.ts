// components/auth/logoutReason.ts
// Why the member is looking at the sign-in page.
//
// Carried as `?logout=` on the sign-in URL, so whatever sent them here says so
// in the one place they will actually read. Without it every sign-out looks
// identical to the member — an admin action, an expiry and their own click all
// land on the same blank form — and the two they did not ask for read as the
// site having logged them out at random.
//
// One sentence each. The member is standing in front of the form that fixes
// it; a paragraph explaining what happened is read by nobody and pushes the
// email field down the page.
//
// An unknown or absent value shows nothing at all. This is an explanation, not
// an error, and a wrong guess is worse than silence.

export const LOGOUT_REASONS = {
  "session-revoked": {
    message: "An administrator ended your session. Please sign in again.",
    tone: "warning",
  },
  "session-expired": {
    message: "Your session expired. Please sign in again.",
    tone: "warning",
  },
  manual: {
    message: "You have successfully signed out.",
    tone: "success",
  },
} as const;

export type LogoutReason = keyof typeof LOGOUT_REASONS;

export function parseLogoutReason(value?: string | null): LogoutReason | null {
  if (!value) return null;
  return value in LOGOUT_REASONS ? (value as LogoutReason) : null;
}

/// Tints, not the destructive token: none of these is an error. A successful
/// sign-out is good news and an expiry is housekeeping, so neither should
/// arrive in the same red the form uses for a failed password.
export const LOGOUT_TONE_CLASSES: Record<
  (typeof LOGOUT_REASONS)[LogoutReason]["tone"],
  string
> = {
  success:
    "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  warning:
    "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
};
