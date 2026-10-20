/**
 * Thread count sent to Ollama with every request.
 *
 * The bundled Ollama container runs under a CPU quota (OLLAMA_CPUS, default 6).
 * Left alone, llama.cpp sizes its thread pool from the host's cores, not the
 * quota, and its threads then spend most of each scheduler period throttled: on
 * a 20-thread host a 7B model fell to 0.09 tokens/s, against ~10 tokens/s with
 * num_thread matched to the quota. 0 or unset-to-empty means "let Ollama decide"
 * (an external or GPU Ollama with no quota).
 */
export function numThread(raw: string | undefined): number | undefined {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function ollamaOptions(base: Record<string, unknown> = {}): Record<string, unknown> {
  const n = numThread(process.env.OLLAMA_NUM_THREAD);
  return n ? { ...base, num_thread: n } : base;
}
