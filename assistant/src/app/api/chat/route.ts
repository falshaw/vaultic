import { z } from "zod";
import { getSession } from "@/lib/auth";
import { ragSearch } from "@/lib/bridge";
import { hybridRerank } from "@/lib/rerank";
import { generateStream, GEN_MODEL } from "@/lib/ollama";
import { appendAudit } from "@/lib/audit";
import { createStreamRedactor } from "@/lib/pii";
import { countRedactions } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const COLLECTION = process.env.RAG_COLLECTION ?? "vaultic";
const RETRIEVE_K = 12; // over-fetch, then rerank down
const FINAL_K = 6;
const schema = z.object({ question: z.string().min(1).max(4000) });

const NO_DOCS =
  "I don't have any indexed documents that cover that. Index a relevant document first, then ask again.";

const SYSTEM =
  'You are a careful assistant for a regulated organisation. Answer the user\'s question using ONLY the provided sources. If the sources do not contain the answer, reply exactly: "The indexed documents don\'t contain that." Never use outside knowledge and never invent facts. Cite the sources you used as [1], [2].';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
  const question = parsed.data.question;

  // Permission-aware retrieval: non-admins retrieve only documents marked
  // visible to all users; admins retrieve everything. Legacy points without a
  // `visibility` payload key are excluded for non-admins (conservative default).
  const visibilityFilter =
    session.role === "admin" ? undefined : { must: [{ key: "visibility", match: { value: "all" } }] };

  // Retrieve, then rerank locally (vector + lexical) down to the final set.
  // A bridge/vector-store outage must NOT be silently rendered as "no documents"
  // (that would write a misleading authoritative negative to the audit log) —
  // surface it as an explicit error instead.
  let rawHits;
  try {
    rawHits = await ragSearch(COLLECTION, question, RETRIEVE_K, visibilityFilter);
  } catch {
    return Response.json(
      { error: "Retrieval is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }
  const hits = hybridRerank(question, rawHits, FINAL_K);
  const sources = hits.map((h) => ({
    sourceName: h.payload?.sourceName ?? "source",
    chunk: h.payload?.chunk,
    score: h.rerankScore,
    snippet: (h.text ?? "").slice(0, 300),
    // PII values the ingest redactor replaced in this chunk (the model never saw them).
    redactions: countRedactions(h.text ?? ""),
  }));

  const userId = session.userId;
  const userEmail = session.email;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      // Sources are known before generation — send them first so the UI can
      // render citations immediately.
      send({ type: "sources", sources });

      // Append to the audit chain before "done" so the UI can show the entry hash.
      const audit = (answer: string) =>
        appendAudit({ userId, userEmail, question, answer, sources, model: GEN_MODEL, collection: COLLECTION })
          .then((row) => row.entryHash)
          .catch(() => null);

      if (hits.length === 0) {
        send({ type: "token", text: NO_DOCS });
        send({ type: "done", piiRedacted: 0, model: GEN_MODEL, auditHash: await audit(NO_DOCS) });
        controller.close();
        return;
      }

      const context = hits
        .map((h, i) => `[${i + 1}] (${h.payload?.sourceName ?? "source"})\n${h.text}`)
        .join("\n\n");
      const prompt = `Sources:\n${context}\n\nQuestion: ${question}\n\nAnswer using only the sources above:`;

      // Stream tokens through the incremental egress redactor: it only releases
      // text up to a boundary no PII token can straddle, so PII matched by the
      // patterns can never reach the client mid-stream (see createStreamRedactor).
      const redactor = createStreamRedactor();
      try {
        for await (const delta of generateStream(SYSTEM, prompt)) {
          const safe = redactor.push(delta);
          if (safe) send({ type: "token", text: safe });
        }
      } catch (e) {
        // Don't echo the raw error to the client — it can contain prompt/context
        // fragments and bypasses the redactor. Log detail server-side only.
        console.error("vaultic chat generation error:", e);
        send({ type: "error", error: "Generation failed. Please try again." });
      }

      // Final flush: emit the redacted remainder; audit-log the FULL redacted answer.
      const { delta: tail, full, piiRedacted } = redactor.flush();
      if (tail) send({ type: "token", text: tail });
      send({ type: "done", piiRedacted, model: GEN_MODEL, auditHash: await audit(full) });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform" },
  });
}
