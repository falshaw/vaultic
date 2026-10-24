// Which retrieved passages count as sources of an answer.

/**
 * Rerank scores are normalised within one result set (the best hit is always
 * near 1), so the cut-off is relative: keep the passages scoring at least
 * RELATIVE_CUTOFF of the best one. The rest never reach the model.
 */
export const RELATIVE_CUTOFF = 0.5;

export function relevantHits<T extends { rerankScore: number }>(hits: T[], cutoff = RELATIVE_CUTOFF): T[] {
  if (hits.length === 0) return [];
  const top = Math.max(...hits.map((h) => h.rerankScore));
  return hits.filter((h) => h.rerankScore >= top * cutoff);
}

/** 1-based source numbers the answer cites as [n] (or [1, 3]), limited to 1..count. */
export function citedNumbers(answer: string, count: number): number[] {
  const found = new Set<number>();
  for (const m of answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const n of m[1].split(",").map((s) => Number(s.trim()))) {
      if (Number.isInteger(n) && n >= 1 && n <= count) found.add(n);
    }
  }
  return [...found].sort((a, b) => a - b);
}
