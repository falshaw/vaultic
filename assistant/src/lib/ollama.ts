// Local generation against the bundled Ollama. No external API — fully on-box.
import { ollamaOptions } from "./ollama-options";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://vaultic-ollama:11434";
export const GEN_MODEL = process.env.GEN_MODEL ?? "qwen2.5:7b";
// A cold model load into VRAM can take 30-60s+ before the first byte; keep the
// ceiling generous and OWN it (don't rely on undici's defaults).
const GEN_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 300_000);
// Keep the model resident so subsequent queries skip the cold start.
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE ?? "30m";

async function chatOnce(system: string, prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
    body: JSON.stringify({
      model: GEN_MODEL,
      stream: false,
      keep_alive: KEEP_ALIVE,
      options: ollamaOptions({ temperature: 0.1 }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`ollama HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.message?.content ?? "";
}

// Circuit breaker (5 consecutive failures opens it for 5min).
// Without it, a dead vaultic-ollama makes every request pay the full retry ladder
// (3 attempts x up to 300s) before failing, so the UI hangs instead of degrading.
const FAILURE_THRESHOLD = 5;
const CIRCUIT_OPEN_MS = 5 * 60 * 1000;
let failureCount = 0;
let circuitOpenedAt = 0;

function isCircuitOpen(): boolean {
  if (failureCount < FAILURE_THRESHOLD) return false;
  if (Date.now() - circuitOpenedAt >= CIRCUIT_OPEN_MS) {
    failureCount = 0;
    circuitOpenedAt = 0;
    return false;
  }
  return true;
}

function recordSuccess(): void {
  failureCount = 0;
  circuitOpenedAt = 0;
}

function recordFailure(): void {
  failureCount++;
  if (failureCount >= FAILURE_THRESHOLD && circuitOpenedAt === 0) {
    circuitOpenedAt = Date.now();
  }
}

// A transient network failure (the connection dropping while the model loads into
// VRAM) surfaces as "fetch failed" / ECONNRESET / a socket error — NOT an HTTP
// status. Those are worth retrying; an HTTP error from ollama is not.
// Our own GEN_TIMEOUT_MS firing is NOT transient: retrying it made a slow model
// hold the request for 3 x 300 s before the user saw an error.
export function isTransient(e: unknown): boolean {
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return false;
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    m.includes("fetch failed") ||
    m.includes("terminated") ||
    m.includes("econnreset") ||
    m.includes("und_err") ||
    m.includes("socket") ||
    m.includes("network")
  );
}

export async function generate(system: string, prompt: string): Promise<string> {
  // The FIRST call after container start cold-loads the model and the connection
  // can drop mid-load ("fetch failed"). Retry a couple of times — the next attempt
  // finds the model warm. Non-transient errors (an HTTP status) are not retried.
  if (isCircuitOpen()) throw new Error("Ollama circuit breaker is open");

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = await chatOnce(system, prompt);
      recordSuccess();
      return out;
    } catch (e) {
      lastErr = e;
      if (!isTransient(e) || attempt === 3) break;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  // Only a fully exhausted call counts against the breaker — a retry that later
  // succeeds must not push the breaker toward an open circuit.
  recordFailure();
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function openChatStream(system: string, prompt: string): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
    body: JSON.stringify({
      model: GEN_MODEL,
      stream: true,
      keep_alive: KEEP_ALIVE,
      options: ollamaOptions({ temperature: 0.1 }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok || !res.body) {
    const t = res.ok ? "missing response body" : await res.text().catch(() => "");
    throw new Error(`ollama HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.body;
}

/**
 * Stream the answer token-by-token from the local model (ollama NDJSON).
 * Cold-load drops are retried ONLY before the first token is yielded — once
 * tokens flow a mid-stream failure is surfaced, not silently restarted.
 */
export async function* generateStream(system: string, prompt: string): AsyncGenerator<string> {
  if (isCircuitOpen()) throw new Error("Ollama circuit breaker is open");

  for (let attempt = 1; attempt <= 3; attempt++) {
    let yielded = false;
    try {
      const body = await openChatStream(system, prompt);
      // The stream opened, so ollama is reachable — clear the breaker now rather
      // than at stream end, which may never come if the client disconnects.
      recordSuccess();
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let json: { message?: { content?: string }; done?: boolean };
          try {
            json = JSON.parse(line);
          } catch {
            continue;
          }
          const content = json.message?.content;
          if (content) {
            yielded = true;
            yield content;
          }
          if (json.done) return;
        }
      }
    } catch (e) {
      if (!isTransient(e) || attempt === 3 || yielded) {
        // A mid-stream failure after tokens flowed is not an availability signal.
        if (!yielded) recordFailure();
        throw e instanceof Error ? e : new Error(String(e));
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}
