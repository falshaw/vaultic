// Sentence-window chunker used by the bridge's /rag/upsert (chunk: true).
// Kept in its own module so it can be unit-tested (assistant/src/test/chunk.test.ts).

/**
 * Split text into ~targetChars pieces. A cut prefers the last sentence
 * boundary in the final 200 characters of a window (only if that keeps the
 * piece longer than half the target); consecutive pieces overlap by
 * overlapChars so a passage cut at a boundary stays retrievable.
 *
 * @param {string} text
 * @param {number} [targetChars=2000]
 * @param {number} [overlapChars=200]
 * @returns {string[]}
 */
export function chunkText(text, targetChars = 2000, overlapChars = 200) {
  if (text.length <= targetChars) return [text];
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + targetChars, text.length);
    if (end < text.length) {
      const lookback = 200;
      const winStart = Math.max(end - lookback, i);
      const window = text.slice(winStart, end);
      // last sentence boundary in window
      const matches = [...window.matchAll(/[.!?]\s+(?=[A-Z])/g)];
      if (matches.length > 0) {
        const m = matches[matches.length - 1];
        const cut = winStart + m.index + m[0].length;
        if (cut > i + Math.floor(targetChars / 2)) end = cut;
      }
    }
    const piece = text.slice(i, end).trim();
    if (piece) chunks.push(piece);
    if (end >= text.length) break;
    i = Math.max(end - overlapChars, i + 1);
  }
  return chunks;
}
