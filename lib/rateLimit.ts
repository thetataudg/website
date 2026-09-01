// lib/rateLimit.ts
// A small fixed-window limiter for the handful of endpoints that are reachable
// without signing in.
//
// Deliberately in-process. It resets on deploy and each serverless instance
// keeps its own counters, so it is not a security boundary and must not be
// treated as one — it is a speed bump that stops one script from opening a
// thousand PaymentIntents in a minute. The real controls for card testing live
// in Stripe Radar. If the public surface grows past donations, this wants to be
// backed by something shared.
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_TRACKED = 5000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  // Cheap eviction: the map is only ever as big as recent traffic, and an
  // unbounded one is its own denial of service.
  if (buckets.size > MAX_TRACKED) {
    for (const [entryKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(entryKey);
    }
    if (buckets.size > MAX_TRACKED) buckets.clear();
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return {
    ok: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/// Best effort, and only ever used as a rate-limit key.
///
/// A forged `x-forwarded-for` costs an attacker nothing, which is the other
/// reason this file is a speed bump rather than a control.
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return (
    first ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-nf-client-connection-ip") ||
    "unknown"
  );
}
