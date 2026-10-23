// Next calls `register` once per server runtime at startup. This is where the
// Node and edge halves of Sentry start; the browser half is
// sentry.client.config.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
