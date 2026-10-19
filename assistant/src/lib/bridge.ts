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
