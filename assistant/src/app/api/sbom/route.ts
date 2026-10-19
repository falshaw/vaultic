import { readFile } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Serve the CycloneDX SBOM generated at build time (Dockerfile `npm run sbom`).
// Admin-only — the dependency inventory is supply-chain evidence, not public UI.
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "admin only" }, { status: 403 });

  try {
    const buf = await readFile(path.join(process.cwd(), "sbom.json"), "utf8");
    return new Response(buf, {
      headers: {
        "content-type": "application/vnd.cyclonedx+json",
        "content-disposition": 'attachment; filename="vaultic-sbom.cyclonedx.json"',
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "SBOM not generated for this build" }, { status: 404 });
  }
}
