import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkLockout } from "@/lib/lockout";
import Shell from "@/components/Shell";
import UsersAdmin from "@/components/UsersAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true, disabled: true, createdAt: true },
  });
  const rows = await Promise.all(
    users.map(async (u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      locked: (await checkLockout(u.email)).state === "locked",
    })),
  );
  const active = rows.filter((u) => !u.disabled).length;

  return (
    <Shell email={session.email} role={session.role}>
      <div className="top-row">
        <div>
          <div className="eyebrow">Admin · access</div>
          <h1>Users</h1>
          <p>
            Admins see every document and page. Users ask questions and retrieve only documents marked visible to all
            users. A role change, disabling or a new password signs the user out at once.
          </p>
        </div>
      </div>

      <div className="stats">
        <div className="stat-card"><div className="eyebrow">Users</div><b>{rows.length}</b></div>
        <div className="stat-card"><div className="eyebrow">Active</div><b className="ok">{active}</b></div>
        <div className="stat-card"><div className="eyebrow">Admins</div><b>{rows.filter((u) => u.role === "admin" && !u.disabled).length}</b></div>
        <div className="stat-card"><div className="eyebrow">Locked</div><b className={rows.some((u) => u.locked) ? "bad" : undefined}>{rows.filter((u) => u.locked).length}</b></div>
      </div>

      <UsersAdmin users={rows} selfId={session.userId} />
    </Shell>
  );
}
