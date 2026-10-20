const STOP = new Set([
  "the", "and", "for", "that", "with", "this", "from", "have", "does", "what", "when", "which", "how", "many",
  "much", "who", "whom", "whose", "are", "was", "were", "has", "had", "into", "onto", "about", "under", "within",
  "their", "there", "they", "them", "your", "our", "its", "any", "all", "can", "may", "must", "should", "would",
]);

function terms(q: string): string[] {
  return [...new Set(q.toLowerCase().match(/[a-z0-9]+/g) ?? [])].filter((t) => t.length >= 3 && !STOP.has(t));
}

/**
 * The part of a retrieved chunk worth showing next to an answer: the `max`-char
 * window that starts at the sentence or line sharing the most terms with the
 * question. Chunks are ~2000 chars, so the first 300 chars were usually a title
 * block rather than the passage the model used. Falls back to the chunk head.
 */
export function bestSnippet(text: string, question: string, max = 300): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const want = terms(question);
  if (want.length === 0) return t.slice(0, max);

  // Candidate start offsets: the chunk start and every sentence / line start.
  const starts = [0];
  const re = /(?:[.!?]\s+|\n+)(?=\S)/g;
  for (let m = re.exec(t); m; m = re.exec(t)) starts.push(m.index + m[0].length);

  let best = 0;
  let bestScore = -1;
  for (const s of starts) {
    const win = t.slice(s, s + max).toLowerCase();
    const score = want.reduce((n, w) => n + (win.includes(w) ? 1 : 0), 0);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return t.slice(best, best + max);
}

/**
 * 1-based chunk position from a Qdrant payload. The bridge writes `_chunkIndex`
 * (0-based) and `_chunkOf`; older points may carry a plain `chunk`.
 */
export function chunkPosition(payload: Record<string, unknown> | undefined): { chunk?: number; chunkOf?: number } {
  const idx = payload?._chunkIndex;
  const of = payload?._chunkOf;
  if (typeof idx === "number") return { chunk: idx + 1, chunkOf: typeof of === "number" ? of : undefined };
  return typeof payload?.chunk === "number" ? { chunk: payload.chunk } : {};
}
