import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions } from "@/lib/sentryOptions";

Sentry.init(
  sentryBaseOptions(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)
);
