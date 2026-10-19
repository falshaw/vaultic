// Fully-local hybrid reranker.
//
// A cloud-LLM reranker is not an option: Vaultic has NO external API by
// design. So retrieval is reranked on-box, with
// no model and no egress: blend the vector-similarity score with a lexical
// overlap score so passages that actually contain the query's terms rise,
// correcting pure-embedding misses (exact IDs, acronyms, rare terms). It is
// deterministic — same inputs, same order — which suits an auditable product.
//
// Not a neural cross-encoder (that would need a model Vaultic doesn't bundle);
// it's a lexical+vector hybrid, the cheap, honest, zero-dependency win.

import type { RagHit } from "./bridge";

// Common words carry no retrieval signal — drop them from the lexical match.
const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "is", "are",
  "be", "with", "that", "this", "it", "as", "at", "by", "from", "what", "which",
  "how", "do", "does", "did", "can", "will", "would", "should", "i", "you", "we",
]);

function terms(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((t) => !STOP.has(t));
}

/** Fraction of the query's distinct terms that appear in the passage, 0..1. */
function lexicalScore(queryTerms: Set<string>, text: string): number {
  if (queryTerms.size === 0) return 0;
  const hay = text.toLowerCase();
  let present = 0;
  for (const t of queryTerms) if (hay.includes(t)) present++;
  return present / queryTerms.size;
}

export interface RerankedHit extends RagHit {
  vectorScore: number; // min-max normalised vector similarity, 0..1
  lexicalScore: number; // query-term overlap, 0..1
  rerankScore: number; // blended score used for ordering
}

/**
 * Rerank retrieval hits with a vector+lexical blend and return the top N.
 * `vectorWeight` controls the blend (default 0.7 vector / 0.3 lexical).
 */
export function hybridRerank(
  query: string,
  hits: RagHit[],
  topN: number,
  vectorWeight = 0.7,
): RerankedHit[] {
  if (hits.length === 0) return [];
  const qt = new Set(terms(query));

  const scores = hits.map((h) => h.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const norm = (s: number) => (max === min ? 1 : (s - min) / (max - min));

  return hits
    .map((h) => {
      const v = norm(h.score);
      const l = lexicalScore(qt, h.text);
      return { ...h, vectorScore: v, lexicalScore: l, rerankScore: vectorWeight * v + (1 - vectorWeight) * l };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, topN);
}
