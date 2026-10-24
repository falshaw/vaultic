import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { documentFilter, ragDeleteByFilter, ragSetPayload } from "@/lib/bridge";
import { auditAdminEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ visibility: z.enum(["all", "admin"]) });
const label = (v: string) => (v === "all" ? "all users" : "admins only");

async function adminAndDoc(id: string) {
  const session = await getSession();
  if (!session) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  if (session.role !== "admin") return { error: Response.json({ error: "admin only" }, { status: 403 }) };
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return { error: Response.json({ error: "Document not found" }, { status: 404 }) };
  // Rows indexed before chunks carried a documentId are found by source name.
  return { session, doc, filter: documentFilter({ ...doc, legacy: doc.contentHash === null }) };
}

/** PATCH /api/documents/:id  { visibility } — who can retrieve the document. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await adminAndDoc((await params).id);
  if ("error" in r) return r.error;
  const { session, doc, filter } = r;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "visibility must be \"all\" or \"admin\"" }, { status: 400 });
  const { visibility } = parsed.data;
  if (visibility === doc.visibility) return Response.json(doc);

  // Retrieval filters on the Qdrant payload, so that is changed first.
  if (!doc.quarantined) {
    const res = await ragSetPayload(doc.collection, filter, { visibility });
    if (!res.ok) return Response.json({ error: `Could not update the index: ${res.error}` }, { status: 502 });
  }
  const updated = await prisma.document.update({ where: { id: doc.id }, data: { visibility } });
  await auditAdminEvent(
    { userId: session.userId, email: session.email },
    "document visibility changed",
    `"${doc.sourceName}" is now visible to ${label(visibility)} (was ${label(doc.visibility)}).`,
    { event: "document_visibility", documentId: doc.id, sourceName: doc.sourceName, from: doc.visibility, to: visibility },
  );
  return Response.json(updated);
}

/** DELETE /api/documents/:id — remove the document and all its chunks. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await adminAndDoc((await params).id);
  if ("error" in r) return r.error;
  const { session, doc, filter } = r;

  // Rows from before documentIds share their points with any other row of the
  // same name (a re-upload): those points stay until the last such row goes.
  const sharesPoints =
    doc.contentHash === null &&
    (await prisma.document.count({
      where: { id: { not: doc.id }, collection: doc.collection, sourceName: doc.sourceName, quarantined: false, contentHash: null },
    })) > 0;

  let removed = 0;
  if (!doc.quarantined && !sharesPoints) {
    const res = await ragDeleteByFilter(doc.collection, filter);
    if (!res.ok) return Response.json({ error: `Could not remove the chunks: ${res.error}` }, { status: 502 });
    removed = res.count;
  }
  await prisma.document.delete({ where: { id: doc.id } });
  await auditAdminEvent(
    { userId: session.userId, email: session.email },
    "document deleted",
    doc.quarantined
      ? `Quarantined upload "${doc.sourceName}" deleted.`
      : `"${doc.sourceName}" deleted with ${removed} chunk${removed === 1 ? "" : "s"}.`,
    { event: "document_deleted", documentId: doc.id, sourceName: doc.sourceName, chunksRemoved: removed },
  );
  return Response.json({ ok: true, chunksRemoved: removed });
}
