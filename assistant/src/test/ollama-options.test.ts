import { afterEach, describe, expect, it } from "vitest";
import { numThread, ollamaOptions } from "../lib/ollama-options";

describe("numThread", () => {
  it("accepts a positive integer", () => {
    expect(numThread("6")).toBe(6);
    expect(numThread("6.0")).toBe(6);
  });
  it("treats empty, zero, negative and junk as unset", () => {
    for (const v of [undefined, "", "0", "-2", "auto"]) expect(numThread(v)).toBeUndefined();
  });
});

describe("ollamaOptions", () => {
  const prev = process.env.OLLAMA_NUM_THREAD;
  afterEach(() => {
    if (prev === undefined) delete process.env.OLLAMA_NUM_THREAD;
    else process.env.OLLAMA_NUM_THREAD = prev;
  });
  it("adds num_thread when configured", () => {
    process.env.OLLAMA_NUM_THREAD = "6";
    expect(ollamaOptions({ temperature: 0.1 })).toEqual({ temperature: 0.1, num_thread: 6 });
  });
  it("leaves the options alone when not configured", () => {
    process.env.OLLAMA_NUM_THREAD = "0";
    expect(ollamaOptions({ temperature: 0.1 })).toEqual({ temperature: 0.1 });
  });
});

describe("isTransient", async () => {
  const { isTransient } = await import("../lib/ollama");
  it("does not retry our own generation timeout", () => {
    const t = new Error("The operation was aborted due to timeout");
    t.name = "TimeoutError";
    expect(isTransient(t)).toBe(false);
  });
  it("retries a connection dropped during a cold model load", () => {
    expect(isTransient(new TypeError("fetch failed"))).toBe(true);
    expect(isTransient(new Error("read ECONNRESET"))).toBe(true);
  });
  it("does not retry an HTTP error from Ollama", () => {
    expect(isTransient(new Error('ollama HTTP 404: model "x" not found'))).toBe(false);
  });
});
