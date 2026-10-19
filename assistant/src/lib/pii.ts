// PII detection + redaction — defense-in-depth, NOT a guarantee. Conservative
// patterns chosen to avoid over-redaction. Applied at ingest (before anything is
// stored) and at egress (before an answer leaves the box).

export interface PiiHit {
  type: string;
  count: number;
}

// Luhn check — gates the card pattern so arbitrary 13–19-digit runs (order refs,
// version strings) are NOT redacted as cards; only checksum-valid PANs are.
function luhnOk(s: string): boolean {
  const d = s.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// NOTE: separators inside these patterns are limited to literal space/dash ([ -]),
// NEVER \s — so no PII token can contain a newline (or a "punct + whitespace"
// sequence). That is what makes the streaming safe-boundary in createStreamRedactor
// sound: a PII match can never straddle a [.?!:;]\s|\n boundary.
const PATTERNS: { type: string; re: RegExp; mask: string; validate?: (m: string) => boolean }[] = [
  { type: "email", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, mask: "[REDACTED:EMAIL]" },
  // IBAN — spaced (4-char groups) and contiguous (no spaces) forms.
  { type: "iban", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}[ ]?[A-Z0-9]{1,3}\b/g, mask: "[REDACTED:IBAN]" },
  { type: "iban", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, mask: "[REDACTED:IBAN]" },
  // Card — 13–19 digits, spaced or not, gated by Luhn to avoid false positives.
  { type: "credit-card", re: /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g, mask: "[REDACTED:CARD]", validate: luhnOk },
  { type: "ssn-us", re: /\b\d{3}-\d{2}-\d{4}\b/g, mask: "[REDACTED:SSN]" },
  // Phone — require a "+" country code or a parenthesised area code so ordinary
  // numeric content ("section 12 34 56", dates) is not mangled. Separators are
  // [ -] only (never \s) to keep the streaming boundary invariant.
  {
    type: "phone",
    re: /(?<!\d)(?:\+\d{1,3}[ -]?(?:\d[ -]?){6,13}\d|\(\d{2,5}\)[ -]?\d(?:[ -]?\d){4,11})(?!\d)/g,
    mask: "[REDACTED:PHONE]",
  },
];

// Heuristic, pattern-based redaction — defense-in-depth, NOT a guarantee. It
// catches the listed PII classes; classes outside PATTERNS (names, passports,
// national IDs, IPs, DOBs) are not covered.
export function redactPii(text: string): { text: string; hits: PiiHit[] } {
  const hits: PiiHit[] = [];
  let out = text;
  for (const p of PATTERNS) {
    let n = 0;
    out = out.replace(p.re, (m) => {
      if (p.validate && !p.validate(m)) return m;
      n++;
      return p.mask;
    });
    if (n > 0) hits.push({ type: p.type, count: n });
  }
  return { text: out, hits };
}

export function totalPii(hits: PiiHit[]): number {
  return hits.reduce((s, h) => s + h.count, 0);
}

// Sentence terminator + whitespace, or a newline. None of the PII PATTERNS above
// can contain these sequences, so a PII token can NEVER straddle one — they are
// safe places to cut a stream. Used to redact incrementally without ever letting
// an unredacted, possibly half-formed PII token reach the client mid-stream.
const SAFE_BOUNDARY = /[.?!:;]\s|\n/g;

function lastSafeBoundary(s: string, from: number): number {
  SAFE_BOUNDARY.lastIndex = from;
  let end = from;
  let m: RegExpExecArray | null;
  while ((m = SAFE_BOUNDARY.exec(s)) !== null) end = m.index + m[0].length;
  return end;
}

/**
 * Incremental, leak-free egress redactor for streamed answers.
 *
 * Feed model deltas to push(); it returns ONLY text that is safe to emit —
 * redacted, and only up to the last boundary a PII token cannot span. The
 * trailing (possibly half-formed) segment is held back until it closes. Call
 * flush() once at the end for the redacted remainder + the full redacted answer
 * (for the audit log). Invariant: any PII MATCHED BY redactPii is masked before
 * it leaves via push() (a match can never straddle the boundary, so the redacted
 * prefix is stable). This is bounded by redactPii's pattern coverage — it is
 * defense-in-depth, not an absolute guarantee.
 */
export function createStreamRedactor() {
  let raw = "";
  let committedRaw = 0; // raw chars finalised (end on a safe boundary)
  let emittedLen = 0; // redacted chars already returned

  return {
    push(delta: string): string {
      raw += delta;
      const boundary = lastSafeBoundary(raw, committedRaw);
      if (boundary <= committedRaw) return "";
      committedRaw = boundary;
      const redacted = redactPii(raw.slice(0, committedRaw)).text;
      const out = redacted.slice(emittedLen);
      emittedLen = redacted.length;
      return out;
    },
    flush(): { delta: string; full: string; piiRedacted: number } {
      const final = redactPii(raw);
      const delta = final.text.slice(emittedLen);
      emittedLen = final.text.length;
      return { delta, full: final.text, piiRedacted: totalPii(final.hits) };
    },
  };
}
