import { z } from "zod";
import { getSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditAdminEvent } from "@/lib/audit";
import { checkLockout } from "@/lib/lockout";
import { passwordProblem } from "@/lib/users";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().max(200),
  role: z.enum(["admin", "user"]),
});

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  if (session.role !== "admin") return { error: Response.json({ error: "admin only" }, { status: 403 }) };
  return { session };
}

/** GET /api/users — every account with its role, status and lockout. */
export async function GET() {
  const r = await requireAdmin();
  if ("error" in r) return r.error;
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true, disabled: true, createdAt: true },
  });
  const withLock = await Promise.all(
    users.map(async (u) => ({ ...u, locked: (await checkLockout(u.email)).state === "locked" })),
  );
  return Response.json({ users: withLock });
}

/** POST /api/users { email, password, role } — create an account. */
export async function POST(req: Request) {
  const r = await requireAdmin();
  if ("error" in r) return r.error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email, a password and a role." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const problem = passwordProblem(parsed.data.password);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  if (await prisma.user.findUnique({ where: { email } })) {
    return Response.json({ error: "An account with this email already exists." }, { status: 409 });
  }
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(parsed.data.password), role: parsed.data.role },
    select: { id: true, email: true, role: true, disabled: true, createdAt: true },
  });
  await auditAdminEvent(
    { userId: r.session.userId, email: r.session.email },
    "user created",
    `${email} created with the ${user.role} role.`,
    { event: "user_created", userId: user.id, email, role: user.role },
  );
  return Response.json({ user: { ...user, locked: false } }, { status: 201 });
}
