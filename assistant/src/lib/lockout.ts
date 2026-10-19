// Postgres-backed per-account login lockout.
//
// 5 failed attempts on an email within the window → locked for 15 minutes.
// Keyed by the submitted email so the account is protected regardless of source
// IP (per-IP abuse is bounded separately by the rate limiter). Vaultic keeps the
// state in the app database (LoginThrottle, scope="account") because it ships
// no Redis.
//
// FAIL-CLOSED: if the store is unavailable the lockout check returns
// "unavailable" and the caller MUST deny the login — the deliberate opposite of
// the rate limiter's fail-open policy. For auth we choose security over
// availability.
//
// Note: an email-keyed lockout means an attacker who knows an email can force a
// 15-minute denial for that account. This is an accepted, bounded trade-off;
// Vaultic also binds the assistant to 127.0.0.1, so there is no anonymous
// internet attacker by design.

import { prisma } from "./prisma";

export const MAX_ATTEMPTS = 5;
export const LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export type LockState = "ok" | "locked" | "unavailable";

export interface LockStatus {
  state: LockState;
  retryAfterSec: number; // seconds until unlock (0 when not locked)
}

export interface FailureResult {
  failures: number;
  locked: boolean;
  justLocked: boolean; // true only on the attempt that triggers the lock
}

function key(email: string): string {
  return email.trim().toLowerCase();
}

/** Check whether an email is currently locked out. Fail-closed on store error. */
export async function checkLockout(email: string): Promise<LockStatus> {
  try {
    const row = await prisma.loginThrottle.findUnique({
      where: { scope_identifier: { scope: "account", identifier: key(email) } },
    });
    const now = Date.now();
    if (row?.lockedUntil && row.lockedUntil.getTime() > now) {
      return { state: "locked", retryAfterSec: Math.ceil((row.lockedUntil.getTime() - now) / 1000) };
    }
    return { state: "ok", retryAfterSec: 0 };
  } catch {
    return { state: "unavailable", retryAfterSec: 0 };
  }
}

/**
 * Record a failed attempt. Increments the in-window failure counter and locks
 * the account once it reaches MAX_ATTEMPTS. Best-effort — a missed increment
 * must never break the login path.
 */
export async function recordFailure(email: string): Promise<FailureResult> {
  const identifier = key(email);
  const now = new Date();
  try {
    // Serialize concurrent failures for the SAME email on a per-email advisory
    // lock so the read-modify-write counter can't undercount (a race would let
    // an attacker exceed MAX_ATTEMPTS before the lock trips).
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"vaultic:lockout:" + identifier})::bigint)`;
      const row = await tx.loginThrottle.findUnique({
        where: { scope_identifier: { scope: "account", identifier } },
      });

      const within = !!row && now.getTime() - row.windowStart.getTime() < LOCK_WINDOW_MS;
      const failures = within ? row.count + 1 : 1;
      const windowStart = within ? row.windowStart : now;
      // nowLocked keeps extending lockedUntil on further failures; justLocked
      // fires the "lockout triggered" audit entry exactly once (was >=, which
      // could double-log in edge timing).
      const nowLocked = failures >= MAX_ATTEMPTS;
      const justLocked = failures === MAX_ATTEMPTS;
      const lockedUntil = nowLocked ? new Date(now.getTime() + LOCK_WINDOW_MS) : null;

      await tx.loginThrottle.upsert({
        where: { scope_identifier: { scope: "account", identifier } },
        create: { scope: "account", identifier, count: failures, windowStart, lockedUntil },
        update: { count: failures, windowStart, lockedUntil },
      });

      return { failures, locked: nowLocked, justLocked };
    });
  } catch {
    return { failures: 0, locked: false, justLocked: false };
  }
}

/** Clear the failure counter on a successful login. Best-effort. */
export async function clearAttempts(email: string): Promise<void> {
  try {
    await prisma.loginThrottle.delete({
      where: { scope_identifier: { scope: "account", identifier: key(email) } },
    });
  } catch {
    // best-effort — no row to clear, or store hiccup
  }
}
