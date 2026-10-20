import { describe, expect, it } from "vitest";
import { bestSnippet } from "../lib/snippet";

const CHUNK = [
  "# ICT Incident Reporting and Classification Procedure",
  "Meridian Capital Partners Ltd, fictional firm. Document ref MCP-PRO-INC-004.",
  "## 1. Purpose",
  "This procedure sets out how the Firm detects, classifies and reports ICT-related incidents. ".repeat(4),
  "## 4. Reporting timelines",
  "- Initial notification: within 4 hours of classification as major, and no later than 24 hours after the incident was detected.",
  "- Intermediate report: within 72 hours of the initial notification.",
].join("\n");

describe("bestSnippet", () => {
  it("returns short text unchanged", () => {
    expect(bestSnippet("Short chunk.", "anything")).toBe("Short chunk.");
  });

  it("picks the passage that matches the question, not the chunk head", () => {
    const s = bestSnippet(CHUNK, "How many hours does the firm have to submit the initial notification of a major ICT incident?");
    expect(s).toContain("Initial notification: within 4 hours");
    expect(s.length).toBeLessThanOrEqual(300);
  });

  it("falls back to the head when nothing matches", () => {
    expect(bestSnippet(CHUNK, "zzz qqq")).toBe(CHUNK.slice(0, 300));
  });
});

describe("chunkPosition", async () => {
  const { chunkPosition } = await import("../lib/snippet");
  it("reads the bridge's 0-based _chunkIndex as a 1-based position", () => {
    expect(chunkPosition({ _chunkIndex: 0, _chunkOf: 2, sourceName: "a.md" })).toEqual({ chunk: 1, chunkOf: 2 });
  });
  it("accepts a legacy plain chunk number", () => {
    expect(chunkPosition({ chunk: 4 })).toEqual({ chunk: 4 });
  });
  it("returns nothing when the payload has no position", () => {
    expect(chunkPosition({ sourceName: "a.md" })).toEqual({});
    expect(chunkPosition(undefined)).toEqual({});
  });
});
