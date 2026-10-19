// AI-attack guardrails — prompt-injection / RAG-poisoning detection (OWASP
// LLM01 + LLM08). Pattern-based, defense-in-depth: it raises suspicion, it is
// not a perfect classifier. Used to QUARANTINE suspicious documents at ingest
// (so a poisoned doc never reaches retrieval) and to screen output at egress.

export interface GuardFinding {
  rule: string;
  severity: "high" | "medium";
  excerpt: string;
}

const INJECTION_PATTERNS: { rule: string; re: RegExp; severity: "high" | "medium" }[] = [
  { rule: "instruction-override", re: /ignore\s+(?:all|any|the)?\s*(?:previous|prior|above|earlier)\s+(?:instructions|prompts|messages|context)/i, severity: "high" },
  { rule: "system-prompt-exfiltration", re: /(?:reveal|print|show|repeat|output|tell me)\s+(?:your|the)\s+(?:system|initial|original)\s+(?:prompt|instructions?)/i, severity: "high" },
  { rule: "role-escape", re: /\b(?:you are now|act as|pretend (?:to be|you are)|from now on,? you are|disregard your)\b/i, severity: "medium" },
  { rule: "jailbreak", re: /\b(?:developer mode|jailbreak|DAN mode|do anything now|without any restrictions)\b/i, severity: "high" },
  { rule: "data-exfiltration", re: /\b(?:send|post|exfiltrate|upload|email|transmit)\s+(?:this|the|all|every)\s+(?:data|documents?|secrets?|content|files?)\s+to\b/i, severity: "high" },
  { rule: "hidden-instruction-markup", re: /<\s*\/?\s*(?:system|instructions?|assistant)\s*>|\[\s*(?:system|inst)\s*\]/i, severity: "medium" },
];

export function scanForInjection(text: string): GuardFinding[] {
  const found: GuardFinding[] = [];
  for (const p of INJECTION_PATTERNS) {
    const m = p.re.exec(text);
    if (m) {
      const start = Math.max(0, m.index - 20);
      found.push({ rule: p.rule, severity: p.severity, excerpt: text.slice(start, m.index + 70).replace(/\s+/g, " ").trim() });
    }
  }
  return found;
}

/** Does the document warrant quarantine (block from indexing)? */
export function shouldQuarantine(findings: GuardFinding[]): boolean {
  return findings.some((f) => f.severity === "high");
}
