import { readFile } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyChain } from "@/lib/audit";
import { buildEvidencePack, type AuditRow, type SbomSummary } from "@/lib/evidence";

export const dynamic = "force-dynamic";

// Summarise the build-time CycloneDX SBOM (if present) for the evidence pack.
async function readSbomSummary(): Promise<SbomSummary | undefined> {
  try {
    const raw = await readFile(path.join(process.cwd(), "sbom.json"), "utf8");
    const doc = JSON.parse(raw) as { bomFormat?: string; specVersion?: string; components?: unknown[] };
    return {
      format: doc.bomFormat ?? "CycloneDX",
      specVersion: doc.specVersion ?? "unknown",
      components: Array.isArray(doc.components) ? doc.components.length : 0,
    };
  } catch {
    return undefined;
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "admin only" }, { status: 403 });

  // Verify the FULL chain (memory-safe, batched), but embed at most the most-
  // recent N records so the pack can't grow unbounded on a long-lived appliance.
  const EVIDENCE_MAX_RECORDS = 5000;
  const chain = await verifyChain();
  const recent = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: EVIDENCE_MAX_RECORDS,
  });
  const rows = recent.reverse();
  const sbom = await readSbomSummary();
  const pack = buildEvidencePack(rows as AuditRow[], new Date().toISOString(), session.email, chain, sbom);
  const body = JSON.stringify(pack, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="vaultic-evidence-pack-${stamp}.json"`,
    },
  });
}
