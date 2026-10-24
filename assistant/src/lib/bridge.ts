// Client for the Vaultic bridge — RAG only (/rag/*). Ollama embeddings → Qdrant.
// The bridge is internal to the compose network; nothing here calls out.

const BRIDGE_URL = process.env.BRIDGE_URL ?? "http://vaultic-bridge:7777";

export interface RagHit {
  text: string;
  score: number;
  payload?: { sourceName?: string; chunk?: number; [k: string]: unknown };
}

/** Index a document's text into a collection (the bridge chunks + embeds it). */
export async function ragUpsert(
  collection: string,
  text: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; chunks?: number; error?: string }> {
  const res = await fetch(`${BRIDGE_URL}/rag/upsert`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-app-name": "vaultic" },
    body: JSON.stringify({ collection, text, payload, chunk: true }),
  });
  if (!res.ok) return { ok: false, error: `bridge upsert HTTP ${res.status}` };
  const json = await res.json().catch(() => ({}));
  return { ok: true, chunks: json.chunks ?? json.count };
}

/** A Qdrant payload filter (passed through the bridge to the vector search). */
export type RagFilter = Record<string, unknown>;

/**
 * Retrieve the most relevant passages for a query. An optional Qdrant `filter`
 * restricts which points are eligible — used for permission-aware retrieval
 * (e.g. only documents whose payload `visibility` is "all").
 */
export async function ragSearch(
  collection: string,
  query: string,
  topK = 6,
  filter?: RagFilter,
): Promise<RagHit[]> {
  const res = await fetch(`${BRIDGE_URL}/rag/search`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-app-name": "vaultic" },
    body: JSON.stringify({ collection, query, topK, ...(filter ? { filter } : {}) }),
  });
  // Throw on transport failure so callers can distinguish an outage from a
  // genuinely empty result set (a successful search with zero hits returns []).
  if (!res.ok) throw new Error(`bridge search HTTP ${res.status}`);
  const json = await res.json().catch(() => ({}));
  const hits = json.results ?? json.hits ?? [];
  return hits.map((h: Record<string, unknown>) => ({
    text: (h.text ?? (h.payload as Record<string, unknown>)?.text ?? "") as string,
    score: (h.score ?? 0) as number,
    payload: (h.payload ?? {}) as RagHit["payload"],
  }));
}

/** Points of one document: by its id, or by source name for points indexed before ids were stored. */
export function documentFilter(doc: { id: string; sourceName: string; legacy?: boolean }): RagFilter {
  return doc.legacy
    ? { must: [{ key: "sourceName", match: { value: doc.sourceName } }] }
    : { must: [{ key: "documentId", match: { value: doc.id } }] };
}

async function byFilter(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; count: number; error?: string }> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-app-name": "vaultic" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) return { ok: false, count: 0, error: json.error ?? `bridge HTTP ${res.status}` };
  return { ok: true, count: json.count ?? 0 };
}

/** Remove every point matching the filter (e.g. all chunks of one document). */
export function ragDeleteByFilter(collection: string, filter: RagFilter) {
  return byFilter("/rag/delete-by-filter", { collection, filter });
}

/** Merge payload keys into every point matching the filter (e.g. a new visibility). */
export function ragSetPayload(collection: string, filter: RagFilter, payload: Record<string, unknown>) {
  return byFilter("/rag/set-payload", { collection, filter, payload });
}
