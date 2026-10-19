// Postgres-backed fixed-window rate limiter.
//
// Vaultic ships no Redis, so the limiter state lives in the app database
// (LoginThrottle, scope="ip"). FAIL-OPEN: if the store errors, the
// request is allowed (availability over strictness for general traffic; auth
// lockout uses the opposite policy — see lockout.ts).
//
// Fixed-window (not sliding): the counter resets when the current window
// elapses. Good enough to bound brute-force volume from one source; the
// per-account lockout is the precise control. A v0 single-node assumption holds
// — there is a benign TOCTOU between read and increment under concurrency.

import { prisma } from "./prisma";

export interface RateLimitPreset {
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  auth: { limit: 10, windowMs: 60_000 }, // login etc.
  api: { limit: 100, windowMs: 60_000 }, // general API
} as const satisfies Record<string, RateLimitPreset>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Fixed-window check. `bucket` namespaces the limiter (e.g. "login"), `id` is
 * the subject (usually client IP). Fail-open on store error.
 */
export async function checkRateLimit(
  bucket: string,
  id: string,
  preset: RateLimitName,
): Promise<RateLimitResult> {
  const { limit, windowMs } = RATE_LIMITS[preset];
  const identifier = `${bucket}:${id}`;
  const now = new Date();
  const retryAfterSec = Math.ceil(windowMs / 1000);

  try {
    const row = await prisma.loginThrottle.findUnique({
      where: { scope_identifier: { scope: "ip", identifier } },
    });

    let count: number;
    if (!row || now.getTime() - row.windowStart.getTime() >= windowMs) {
      // No row or the window has elapsed → start a fresh window.
      await prisma.loginThrottle.upsert({
        where: { scope_identifier: { scope: "ip", identifier } },
        create: { scope: "ip", identifier, count: 1, windowStart: now },
        update: { count: 1, windowStart: now, lockedUntil: null },
      });
      count = 1;
    } else {
      const updated = await prisma.loginThrottle.update({
        where: { scope_identifier: { scope: "ip", identifier } },
        data: { count: { increment: 1 } },
      });
      count = updated.count;
    }

    const allowed = count <= limit;
    return { allowed, limit, remaining: Math.max(0, limit - count), retryAfterSec };
  } catch {
    // Fail-open: never block traffic when the limiter store is unavailable.
    return { allowed: true, limit, remaining: limit, retryAfterSec: 0 };
  }
}

// x-forwarded-for / x-real-ip are CLIENT-controlled, so honour them only when
// TRUST_PROXY=true (the app genuinely sits behind a known reverse proxy).
// Default: Vaultic binds 127.0.0.1 with no proxy, so trusting these would let an
// attacker spoof the per-IP limit and poison the audit log's IP field. When
// untrusted, all requests bucket as "local" — fine for a single-tenant appliance
// where the per-account lockout is the real brute-force control.
const TRUST_PROXY = process.env.TRUST_PROXY === "true";

/** Client IP for rate-limiting / audit (see TRUST_PROXY note above). */
export function clientIp(req: Request): string {
  if (TRUST_PROXY) {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    const real = req.headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  return "local";
}

/** 429 response with a Retry-After header. */
export function tooManyRequests(retryAfterSec: number): Response {
  return Response.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
