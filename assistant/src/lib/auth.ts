import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { encodeJwtSecret, signHs256, verifyHs256 } from "./auth-core";

export { hashPassword, verifyPassword } from "./auth-core";

const COOKIE_NAME = "vaultic_session";
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24h

const KNOWN_WEAK = ["changeme", "change-me", "placeholder", "your-secret", "dev-only", "example"];

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (secret && KNOWN_WEAK.some((w) => secret.toLowerCase().includes(w))) {
    throw new Error(
      "JWT_SECRET is a known weak/placeholder value — set a strong random secret (openssl rand -hex 32)",
    );
  }
  return encodeJwtSecret(secret, { minLength: 32 });
}

export interface SessionUser {
  userId: string;
  email: string;
  role: "admin" | "user";
}

export async function createToken(payload: SessionUser): Promise<string> {
  return signHs256({ ...payload }, getJwtSecret(), {
    expiresIn: "24h",
    jti: crypto.randomUUID(),
  });
}

export async function verifyToken(token: string): Promise<SessionUser> {
  const p = await verifyHs256(token, getJwtSecret());
  return {
    userId: p.userId as string,
    email: p.email as string,
    role: (p.role as "admin" | "user") ?? "user",
  };
}

export async function createSession(user: SessionUser, userAgent?: string, ipAddress?: string) {
  const token = await createToken(user);
  const expiresAt = new Date(Date.now() + SESSION_DURATION);
  await prisma.session.create({ data: { userId: user.userId, token, expiresAt, userAgent, ipAddress } });
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const payload = await verifyToken(token);
    const session = await prisma.session.findUnique({ where: { token } });
    if (!session || session.expiresAt < new Date()) {
      if (session) await prisma.session.delete({ where: { token } }).catch(() => {});
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function deleteSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } }).catch(() => {});
    store.delete(COOKIE_NAME);
  }
}
