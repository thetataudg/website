import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * Turns whatever a route's catch block caught into the right status.
 *
 * Routes used to answer every failure with a 403, so a Mongo timeout, a bad
 * date or a notification hiccup while creating an event all reached the app
 * as "You don't have access to this", even for officers who plainly did.
 * Only real auth failures are 401/403 now; anything else is a 500.
 */
export function apiErrorResponse(err: any) {
  const { status, error } = classify(err);
  // Refusals are what members were seeing as "You don't have access", so
  // they're worth seeing in Sentry too, as warnings rather than errors.
  // Crashes (5xx) already reach Sentry through `logger.error`.
  if (status === 401 || status === 403) {
    Sentry.captureMessage(`API ${status}: ${error}`, "warning");
  }
  return NextResponse.json({ error }, { status });
}

/// True when the failure is the request being refused or rejected (4xx), as
/// opposed to the server breaking. The logger uses it to keep refusals out of
/// Sentry's error count.
export function isClientError(err: any): boolean {
  const { status } = classify(err);
  return status >= 400 && status < 500;
}

function classify(err: any): { status: number; error: string } {
  const message = String(err?.message || "");

  const code = Number(err?.statusCode ?? err?.status);
  if (Number.isInteger(code) && code >= 400 && code < 500) {
    return { status: code, error: message || "Request failed" };
  }

  // The older guards throw plain Errors ("Not authorized - E-Council only",
  // "Only Regent can snap bid") rather than ForbiddenError.
  if (/^not authori[sz]ed\b/i.test(message) || /^only .+ can /i.test(message)) {
    return { status: 403, error: message };
  }
  if (/^unauthori[sz]ed$/i.test(message)) {
    return { status: 401, error: message };
  }

  // Bad input: an id that isn't an ObjectId, a field the schema rejects. The
  // raw Mongoose text names internals, so it stays in the logs.
  if (err?.name === "CastError" || err?.name === "ValidationError") {
    return { status: 400, error: "Some of that information wasn't valid." };
  }

  return { status: 500, error: "Something went wrong." };
}
