import { createHash } from "crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ragUpsert } from "@/lib/bridge";
import { extractFromFile } from "@/lib/extract";
import { redactPii, totalPii } from "@/lib/pii";
import { scanForInjection, shouldQuarantine } from "@/lib/guard";
import { auditAdminEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

const COLLECTION = process.env.RAG_COLLECTION ?? "vaultic";
const MAX_BYTES = 5_000_000; // 5 MB
const VISIBILITIES = ["all", "admin"] as const;
type Visibility = (typeof VISIBILITIES)[number];
const jsonSchema = z.object({
  sourceName: z.string().min(1).max(200),
  text: z.string().min(1).max(500_000),
  visibility: z.enum(VISIBILITIES).optional(),
});

function parseVisibility(v: unknown): Visibility {
  return v === "admin" ? "admin" : "all"; // default: visible to all users
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "admin only" }, { status: 403 });

  const ct = req.headers.get("content-type") ?? "";
  let sourceName: string;
  let text: string;
  let visibility: Visibility;

  // Accept a real file upload (PDF/TXT/MD/CSV/JSON) or a JSON paste (back-compat).
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "no file provided" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "file too large (max 5 MB)" }, { status: 413 });
    sourceName = ((form.get("sourceName") as string) || file.name).slice(0, 200);
    visibility = parseVisibility(form.get("visibility"));
    try {
      const extracted = await extractFromFile(file.name, file.type, await file.arrayBuffer());
      text = extracted.text;
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "extraction failed" }, { status: 422 });
    }
    if (!text) {
      return Response.json({ error: "No extractable text (scanned image? OCR not yet supported)." }, { status: 422 });
    }
  } else {
    const parsed = jsonSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
    sourceName = parsed.data.sourceName;
    text = parsed.data.text;
    visibility = parseVisibility(parsed.data.visibility);
  }

  // 1) Injection / RAG-poisoning screen — quarantine (never index) on high severity.
  const findings = scanForInjection(text);
  const quarantined = shouldQuarantine(findings);

  // 2) PII redaction before anything is stored or embedded.
  const { text: clean, hits } = redactPii(text);
  const piiCount = totalPii(hits);

  // 3) The same content is indexed once: a re-upload names the existing document.
  const contentHash = createHash("sha256").update(clean).digest("hex");
  if (!quarantined) {
    const existing = await prisma.document.findFirst({
      where: { collection: COLLECTION, contentHash, quarantined: false },
      select: { sourceName: true },
    });
    if (existing) {
      return Response.json(
        { error: `Already indexed as "${existing.sourceName}". Delete that document first to index it again.` },
        { status: 409 },
      );
    }
  }

  // The row comes first so its id can go into every chunk's payload: delete and
  // visibility changes then address exactly this document's points.
  const doc = await prisma.document.create({
    data: {
      collection: COLLECTION,
      sourceName,
      chunks: 0,
      ingestedById: session.userId,
      quarantined,
      visibility,
      piiRedactions: piiCount,
      contentHash,
      injectionFindings: findings.length ? (findings as unknown as Prisma.InputJsonValue) : undefined,
    },
  });

  let chunks = 0;
  if (!quarantined) {
    // Store visibility in the Qdrant payload so retrieval can filter by role.
    const r = await ragUpsert(COLLECTION, clean, { sourceName, visibility, documentId: doc.id });
    if (!r.ok) {
      await prisma.document.delete({ where: { id: doc.id } }).catch(() => {});
      return Response.json({ error: r.error ?? "ingest failed" }, { status: 502 });
    }
    chunks = r.chunks ?? 0;
    await prisma.document.update({ where: { id: doc.id }, data: { chunks } });
  }

  await auditAdminEvent(
    { userId: session.userId, email: session.email },
    quarantined ? "document quarantined" : "document indexed",
    quarantined
      ? `"${sourceName}" was not indexed: possible prompt injection (${findings.map((f) => f.rule).join(", ")}).`
      : `"${sourceName}" indexed: ${chunks} chunk${chunks === 1 ? "" : "s"}, visible to ${visibility === "all" ? "all users" : "admins only"}, ${piiCount} PII value${piiCount === 1 ? "" : "s"} redacted.`,
    { event: quarantined ? "document_quarantined" : "document_indexed", documentId: doc.id, sourceName, visibility, chunks, piiRedactions: piiCount, contentHash },
  );

  return Response.json({
    ok: !quarantined,
    sourceName,
    chunks,
    quarantined,
    visibility,
    piiRedactions: piiCount,
    injectionFindings: findings,
    warning: quarantined
      ? `Quarantined — possible prompt-injection/poisoning (${findings.map((f) => f.rule).join(", ")}). NOT indexed.`
      : piiCount > 0
        ? `Indexed with ${piiCount} PII value(s) redacted before storage.`
        : undefined,
  });
}
