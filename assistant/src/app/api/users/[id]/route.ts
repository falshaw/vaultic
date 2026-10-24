import { z } from "zod";
import { getSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditAdminEvent } from "@/lib/audit";
import { clearAttempts } from "@/lib/lockout";
import { changeProblem, passwordProblem } from "@/lib/users";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    role: z.enum(["admin", "user"]).optional(),
    disabled: z.boolean().optional(),
    unlock: z.literal(true).optional(),
    password: z.string().max(200).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "nothing to change");

/**
 * PATCH /api/users/:id { role?, disabled?, unlock?, password? }
 * A role change, disabling or a new password ends the user's sessions, so it
 * applies at once (the role is carried in the session token).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "admin only" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Nothing valid to change." }, { status: 400 });
  const body = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: (await params).id } });
  if (!target) return Response.json({ error: "User not found" }, { status: 404 });

  const activeAdmins = await prisma.user.count({ where: { role: "admin", disabled: false } });
  const problem = changeProblem(target, session.userId, activeAdmins, body);
  if (problem) return Response.json({ error: problem }, { status: 409 });
  if (body.password !== undefined) {
    const pw = passwordProblem(body.password);
    if (pw) return Response.json({ error: pw }, { status: 400 });
  }

  const changes: string[] = [];
  const data: { role?: "admin" | "user"; disabled?: boolean; passwordHash?: string } = {};
  if (body.role && body.role !== target.role) {
    data.role = body.role;
    changes.push(`role ${target.role} → ${body.role}`);
  }
  if (body.disabled !== undefined && body.disabled !== target.disabled) {
    data.disabled = body.disabled;
    changes.push(body.disabled ? "disabled" : "enabled");
  }
  if (body.password !== undefined) {
    data.passwordHash = await hashPassword(body.password);
    changes.push("password reset");
  }
  if (body.unlock) {
    await clearAttempts(target.email);
    changes.push("unlocked");
  }
  if (changes.length === 0) return Response.json({ ok: true, changed: [] });

  if (Object.keys(data).length > 0) {
    await prisma.user.update({ where: { id: target.id }, data });
    await prisma.session.deleteMany({ where: { userId: target.id } });
  }
  await auditAdminEvent(
    { userId: session.userId, email: session.email },
    "user changed",
    `${target.email}: ${changes.join(", ")}.`,
    { event: "user_changed", userId: target.id, email: target.email, changes },
  );
  return Response.json({ ok: true, changed: changes });
}
