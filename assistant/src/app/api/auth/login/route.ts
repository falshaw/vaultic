import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword, createSession } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { checkRateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { checkLockout, recordFailure, clearAttempts, MAX_ATTEMPTS, LOCK_WINDOW_MS } from "@/lib/lockout";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

// First-boot: if no users exist, create the admin from env so the operator can
// log in. Idempotent — only fires when the user table is empty.
async function ensureAdmin() {
  const count = await prisma.user.count();
  if (count > 0) return;
  const email = process.env.VAULTIC_ADMIN_EMAIL;
  const password = process.env.VAULTIC_ADMIN_PASSWORD;
  if (!email || !password) return;
  try {
    await prisma.user.create({
      data: { email: email.toLowerCase(), passwordHash: await hashPassword(password), role: "admin" },
    });
  } catch {
    // Concurrent first-boot logins race between count() and create(); the unique
    // email constraint makes the loser throw. Ignore — the admin now exists.
  }
}

export async function POST(req: Request) {
  const ip = clientIp(req);

  // Per-IP rate limit (fail-open) — bounds brute-force volume from one source.
  const rl = await checkRateLimit("login", ip, "auth");
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });

  await ensureAdmin();

  const email = parsed.data.email.toLowerCase();

  // Per-account lockout (fail-closed) — checked before any password work so a
  // locked account cannot be probed and a store outage denies rather than opens.
  const lock = await checkLockout(email);
  if (lock.state === "locked") {
    return Response.json(
      { error: "Account temporarily locked after repeated failed logins. Try again later." },
      { status: 423, headers: { "Retry-After": String(lock.retryAfterSec) } },
    );
  }
  if (lock.state === "unavailable") {
    return Response.json(
      { error: "Login is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    const fail = await recordFailure(email);
    if (fail.justLocked) {
      // Record the lockout in the tamper-evident audit log (collection
      // "security" so it stays out of the Q&A query metrics).
      await appendAudit({
        userId: user?.id ?? null,
        userEmail: email,
        question: "[security] login lockout triggered",
        answer: `Account locked for ${LOCK_WINDOW_MS / 60000} minutes after ${MAX_ATTEMPTS} failed login attempts (last from ${ip}).`,
        sources: [{ event: "account_lockout", ip, attempts: MAX_ATTEMPTS }],
        model: "—",
        collection: "security",
      }).catch(() => {}); // audit logging must never break the login path
    }
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await clearAttempts(email);

  await createSession(
    { userId: user.id, email: user.email, role: user.role },
    req.headers.get("user-agent") ?? undefined,
    ip === "unknown" ? undefined : ip,
  );
  return Response.json({ ok: true });
}
