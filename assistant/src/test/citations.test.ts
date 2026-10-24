import { describe, it, expect } from "vitest";
import { citedNumbers, relevantHits } from "../lib/citations";

describe("relevantHits", () => {
  it("drops passages far below the best one (the README question: 0.94 … 0.08)", () => {
    const hits = [0.94, 0.57, 0.54, 0.31, 0.2, 0.08].map((rerankScore) => ({ rerankScore }));
    expect(relevantHits(hits).map((h) => h.rerankScore)).toEqual([0.94, 0.57, 0.54]);
  });

  it("keeps the best passage and handles an empty result", () => {
    expect(relevantHits([{ rerankScore: 0.1 }])).toHaveLength(1);
    expect(relevantHits([])).toEqual([]);
  });
});

describe("citedNumbers", () => {
  it("reads [n] and [n, m] markers within range", () => {
    expect(citedNumbers("Within 4 hours [1]. Also 24 hours [1, 3].", 3)).toEqual([1, 3]);
    expect(citedNumbers("See [7] and [0].", 3)).toEqual([]);
  });

  it("finds nothing in an answer that cites nothing", () => {
    expect(citedNumbers("The indexed documents don't contain that.", 6)).toEqual([]);
  });
});
