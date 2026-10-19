import { getSession } from "@/lib/auth";
import { runRedTeam } from "@/lib/redteam";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "admin only" }, { status: 403 });
  return Response.json(runRedTeam());
}
