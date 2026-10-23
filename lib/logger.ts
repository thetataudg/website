import pino from "pino";
import * as Sentry from "@sentry/nextjs";
import { isClientError } from "@/lib/apiError";

/// pino's numeric level for `logger.error` and above.
const ERROR_LEVEL = 50;

const logger = pino({
  level: "info",
  base: {
    pid: undefined,
    hostname: undefined,
  },
  hooks: {
    // Every route already logs its failures as `logger.error({ err }, "…")`,
    // so forwarding those to Sentry covers the whole API without touching
    // each catch block. 4xx errors are the member's request being refused on
    // purpose, not a bug, and would only spend the monthly quota.
    logMethod(args, method, level) {
      if (level >= ERROR_LEVEL) reportToSentry(args);
      return method.apply(this, args as Parameters<typeof method>);
    },
  },
});

function reportToSentry(args: unknown[]) {
  try {
    const [first, second] = args as [any, any];
    const message = typeof first === "string" ? first : typeof second === "string" ? second : "";
    const err = first instanceof Error ? first : first?.err ?? first?.error;

    if (err && isClientError(err)) return;
    // Next's own build-time signal that a route is dynamic, which some catch
    // blocks log on the way past. Not a failure.
    if (err?.digest === "DYNAMIC_SERVER_USAGE") return;

    if (err instanceof Error) {
      Sentry.captureException(err, { extra: { log: message } });
    } else if (message) {
      Sentry.captureMessage(message, { level: "error", extra: { context: first } });
    }
  } catch {
    // Reporting must never be the thing that breaks a request.
  }
}

export default logger;
