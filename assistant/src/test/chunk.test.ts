import { describe, it, expect } from "vitest";
// The chunker runs in the bridge container; it lives in its own module so it can be tested here.
import { chunkText } from "../../../bridge/chunk.mjs";

function sentences(n: number): string {
  return Array.from(
    { length: n },
    (_, i) => `Sentence ${i + 1} describes control number ${i + 1} in some detail.`,
  ).join(" ");
}

describe("chunkText", () => {
  it("returns short text as a single chunk", () => {
    expect(chunkText("Short policy text.", 2000, 200)).toEqual(["Short policy text."]);
  });

  it("keeps every chunk within the target size", () => {
    const chunks = chunkText(sentences(200), 2000, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(2000);
  });

  it("cuts at sentence boundaries when one is near the window end", () => {
    const chunks = chunkText(sentences(200), 2000, 200);
    for (const c of chunks.slice(0, -1)) expect(c.endsWith(".")).toBe(true);
  });

  it("overlaps consecutive chunks", () => {
    const chunks = chunkText(sentences(200), 2000, 200);
    for (let i = 1; i < chunks.length; i++) {
      const tail = chunks[i - 1].slice(-100);
      expect(chunks[i]).toContain(tail.slice(tail.indexOf(" ") + 1, tail.indexOf(" ") + 40));
    }
  });

  it("loses no text: every sentence appears in some chunk", () => {
    const text = sentences(150);
    const chunks = chunkText(text, 1000, 100);
    for (let i = 1; i <= 150; i++) {
      const s = `Sentence ${i} describes control number ${i} in some detail.`;
      expect(chunks.some((c) => c.includes(s))).toBe(true);
    }
  });

  it("splits text without sentence boundaries by size and makes progress", () => {
    const chunks = chunkText("x".repeat(5000), 2000, 200);
    expect(chunks.map((c) => c.length)).toEqual([2000, 2000, 1400]);
  });

  it("never returns empty chunks", () => {
    const chunks = chunkText(sentences(50) + "   \n\n   ", 500, 50);
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
  });
});
