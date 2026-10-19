import { getSession } from "@/lib/auth";
import { getEgressManifest, buildContainmentPack } from "@/lib/egress";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "admin only" }, { status: 403 });

  const manifest = getEgressManifest();
  const md = buildContainmentPack(manifest, session.email);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="vaultic-containment-pack-${stamp}.md"`,
    },
  });
}
