import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";
import { sentryBaseOptions } from "@/lib/sentryOptions";

/// Scrapers that run the page in Deno rather than a browser report from
/// `ext:core/...` frames. They are not members and nothing they hit is ours to
/// fix: the `getReader` TypeError on /brothers came entirely from one.
function fromHeadlessRuntime(event: ErrorEvent): boolean {
  return Boolean(
    event.exception?.values?.some((value) =>
      value.stacktrace?.frames?.some((frame) =>
        String(frame.filename || "").startsWith("ext:")
      )
    )
  );
}

Sentry.init({
  ...sentryBaseOptions(process.env.NEXT_PUBLIC_SENTRY_DSN),
  beforeSend(event) {
    return fromHeadlessRuntime(event) ? null : event;
  },
});
