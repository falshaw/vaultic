"use client";

import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, X } from "lucide-react";
import { nextSourceName } from "@/lib/source-name";

interface Source {
  sourceName?: string;
  chunk?: number;
  chunkOf?: number;
  score?: number;
  snippet?: string;
  redactions?: number;
}
interface Turn {
  question: string;
  answer: string;
  sources: Source[];
  done: boolean;
  piiRedacted: number;
  auditHash: string | null;
  error?: string;
}
type IngestResult = { tone: "ok" | "warn" | "bad"; text: string };

const SESSION_EXPIRED = "/login";

/** Splits a chunk into text and highlighted [REDACTED:*] markers. */
function withMarkers(text: string) {
  return text.split(/(\[REDACTED:[A-Z-]+\])/g).map((part, i) =>
    /^\[REDACTED:/.test(part) ? (
      <span className="s" key={i}>{part}</span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function cite(s: Source) {
  return `${s.sourceName ?? "source"}${s.chunk != null ? ` · chunk ${s.chunk}${s.chunkOf ? `/${s.chunkOf}` : ""}` : ""}`;
}

export default function Workbench({ isAdmin, model }: { isAdmin: boolean; model: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selected, setSelected] = useState(0);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);

  const [showIngest, setShowIngest] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [srcName, setSrcName] = useState("");
  const [autoName, setAutoName] = useState<string | null>(null);
  const [srcText, setSrcText] = useState("");
  const [visibility, setVisibility] = useState<"all" | "admin">("all");
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null);
  const questionRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function patchLast(fn: (t: Turn) => Turn) {
    setTurns((all) => (all.length ? [...all.slice(0, -1), fn(all[all.length - 1])] : all));
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question || asking) return;
    setSelected(turns.length);
    setTurns((all) => [...all, { question, answer: "", sources: [], done: false, piiRedacted: 0, auditHash: null }]);
    setQ("");
    setAsking(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (res.status === 401) {
        router.push(SESSION_EXPIRED);
        return;
      }
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        patchLast((t) => ({ ...t, done: true, error: j.error ?? `Request failed (${res.status})` }));
        return;
      }
      // NDJSON stream: {type: "sources" | "token" | "error" | "done"} per line.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: { type: string; sources?: Source[]; text?: string; error?: string; piiRedacted?: number; auditHash?: string | null };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === "sources") patchLast((t) => ({ ...t, sources: ev.sources ?? [] }));
          else if (ev.type === "token") patchLast((t) => ({ ...t, answer: t.answer + (ev.text ?? "") }));
          else if (ev.type === "error") patchLast((t) => ({ ...t, error: ev.error ?? "Generation failed" }));
          else if (ev.type === "done")
            patchLast((t) => ({ ...t, done: true, piiRedacted: ev.piiRedacted ?? 0, auditHash: ev.auditHash ?? null }));
        }
      }
      patchLast((t) => ({ ...t, done: true }));
    } catch {
      patchLast((t) => ({ ...t, done: true, error: t.error ?? "Network error" }));
    } finally {
      setAsking(false);
      questionRef.current?.focus();
    }
  }

  async function ingest(e: React.FormEvent) {
    e.preventDefault();
    if (ingesting || (!file && !srcText.trim())) return;
    setIngesting(true);
    setIngestResult(null);
    try {
      let res: Response;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        if (srcName.trim()) fd.append("sourceName", srcName.trim());
        fd.append("visibility", visibility);
        res = await fetch("/api/ingest", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourceName: srcName.trim() || "pasted-document", text: srcText, visibility }),
        });
      }
      if (res.status === 401) {
        router.push(SESSION_EXPIRED);
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIngestResult({ tone: "bad", text: j.error ?? `Ingest failed (${res.status})` });
        return;
      }
      if (j.quarantined) {
        setIngestResult({ tone: "bad", text: j.warning ?? "Quarantined, not indexed." });
      } else {
        const who = j.visibility === "admin" ? "admins only" : "all users";
        const pii = j.piiRedactions ? ` ${j.piiRedactions} PII value${j.piiRedactions === 1 ? "" : "s"} redacted before storage.` : "";
        setIngestResult({ tone: j.piiRedactions ? "warn" : "ok", text: `Indexed “${j.sourceName}”: ${j.chunks} chunk${j.chunks === 1 ? "" : "s"}, visible to ${who}.${pii}` });
      }
      // Reset after every processed upload, indexed or quarantined.
      setFile(null);
      setFileKey((k) => k + 1);
      setSrcName("");
      setAutoName(null);
      setSrcText("");
    } catch {
      setIngestResult({ tone: "bad", text: "Network error" });
    } finally {
      setIngesting(false);
    }
  }

  const current = turns[selected];
  const redactedChunks = current?.sources.map((s, i) => ({ s, i })).filter(({ s }) => (s.redactions ?? 0) > 0) ?? [];

  return (
    <>
      <div className="top-row">
        <div>
          <div className="eyebrow">Ask · answered from your documents</div>
          <h1>Workbench</h1>
        </div>
        {isAdmin && (
          <div className="tools">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowIngest((v) => !v)}
              aria-expanded={showIngest}
              aria-controls="ingest-panel"
            >
              {showIngest ? <X aria-hidden /> : <FilePlus2 aria-hidden />}
              {showIngest ? "Close" : "Add document"}
            </button>
          </div>
        )}
      </div>

      {isAdmin && showIngest && (
        <form id="ingest-panel" className="tile ingest" onSubmit={ingest} aria-labelledby="ingest-title">
          <div>
            <h2 id="ingest-title">Add a document</h2>
            <div className="muted" style={{ fontSize: 13 }}>
              Screened for prompt injection, PII redacted, then embedded by the local model and stored in the local vector store.
            </div>
          </div>
          <div className="ingest-grid">
            <div className="field">
              <label className="label" htmlFor="ingest-file">File (PDF, TXT, MD, CSV, JSON · max 5 MB)</label>
              <input
                key={fileKey}
                id="ingest-file"
                className="input"
                type="file"
                accept=".pdf,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setSrcName(nextSourceName(srcName, autoName, f));
                  setAutoName(f ? f.name : null);
                }}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="ingest-name">Source name</label>
              <input id="ingest-name" className="input" value={srcName} onChange={(e) => setSrcName(e.target.value)} placeholder="e.g. AML-Policy-2026.pdf" />
            </div>
            <div className="field">
              <label className="label" htmlFor="ingest-vis">Who can retrieve it</label>
              <select id="ingest-vis" className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as "all" | "admin")}>
                <option value="all">All users</option>
                <option value="admin">Admins only</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="ingest-text">{file ? "Pasted text (ignored while a file is selected)" : "…or paste the text"}</label>
            <textarea id="ingest-text" className="input" rows={4} value={srcText} onChange={(e) => setSrcText(e.target.value)} disabled={!!file} placeholder="Paste document text to index" />
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" type="submit" disabled={ingesting || (!file && !srcText.trim())}>
              {ingesting ? "Indexing…" : "Index document"}
            </button>
            {ingestResult && (
              <div className={`banner ${ingestResult.tone === "ok" ? "ok" : ingestResult.tone === "warn" ? "warn" : "bad"}`} role="status" style={{ flex: 1, minWidth: 240 }}>
                <span>{ingestResult.text}</span>
              </div>
            )}
          </div>
        </form>
      )}

      <div className="wgrid">
        <section className="tile thread" aria-label="Conversation">
          {turns.length === 0 && (
            <div className="empty" style={{ textAlign: "left", padding: "4px 0" }}>
              <b>Ask a question about your indexed documents</b>
              Answers come from the local model, cite the passages they used, and are written to the audit chain.
              {isAdmin ? " Use Add document to index a file first." : ""}
            </div>
          )}
          {turns.map((t, ti) => (
            <Fragment key={ti}>
              <div className="msg me">
                <div className="bubble">{t.question}</div>
              </div>
              <div className="msg">
                <div className="ai-av" aria-hidden>AI</div>
                <div className="bubble" aria-live={ti === turns.length - 1 ? "polite" : undefined}>
                  {t.answer || (!t.done && !t.error ? <span className="typing" aria-label="Generating"><i /><i /><i /></span> : null)}
                  {t.error && <div style={{ color: "var(--red)", marginTop: t.answer ? 8 : 0 }}>{t.error}</div>}
                  {t.sources.length > 0 && (
                    <div className="cites">
                      {t.sources.map((s, i) => (
                        <a key={i} className="cite" href={`#chunk-${ti}-${i}`} onClick={() => setSelected(ti)} title={cite(s)}>
                          [{i + 1}] {cite(s)}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {t.done && !t.error && (
                <div className="meta">
                  <span>Model <b>{model}</b></span>
                  <span>{t.sources.length} source{t.sources.length === 1 ? "" : "s"}</span>
                  {t.auditHash && (
                    <span>Audit entry <b title={t.auditHash}>{t.auditHash.slice(0, 12)}</b></span>
                  )}
                  {turns.length > 1 && selected !== ti && t.sources.length > 0 && (
                    <button type="button" className="link-btn" onClick={() => setSelected(ti)}>Show chunks</button>
                  )}
                </div>
              )}
            </Fragment>
          ))}
          <form className="ask" onSubmit={ask}>
            <input
              ref={questionRef}
              className="input"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask a question about your documents"
              aria-label="Question"
              maxLength={4000}
            />
            <button className="btn btn-primary" type="submit" disabled={asking || !q.trim()}>
              {asking ? "Asking…" : "Ask"}
            </button>
          </form>
        </section>

        <section className="tile chunks" aria-labelledby="chunks-title">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 id="chunks-title">Retrieved chunks</h2>
              <div className="muted" style={{ fontSize: 13 }}>hybrid rerank · vector + lexical overlap</div>
            </div>
            <span className="badge b-teal">local only</span>
          </div>
          {!current || current.sources.length === 0 ? (
            <div className="empty">
              {current && current.done
                ? "No passages matched. The answer above says so instead of guessing."
                : "The passages behind each answer appear here, with document name and chunk id."}
            </div>
          ) : (
            <>
              {current.sources.map((s, i) => (
                <div className="chunk-target" id={`chunk-${selected}-${i}`} key={i}>
                  <pre className="code wrap" tabIndex={0} aria-label={`Source ${i + 1}: ${cite(s)}`}>
                    <span className="c"># [{i + 1}]{typeof s.score === "number" ? ` score ${s.score.toFixed(2)}` : ""}</span>
                    {"\n"}<span className="k">doc</span>   <span className="s">{s.sourceName ?? "source"}</span>
                    {"\n"}<span className="k">chunk</span> {s.chunk != null ? `${s.chunk}${s.chunkOf ? ` of ${s.chunkOf}` : ""}` : "n/a"}
                    {"\n"}…{withMarkers(s.snippet ?? "")}…
                  </pre>
                </div>
              ))}
              {current.done && (
                <>
                  {redactedChunks.length > 0 ? (
                    <div className="banner ok">
                      <span aria-hidden>✓</span>
                      <span>
                        <b>PII masked at ingest.</b>{" "}
                        {redactedChunks
                          .map(({ s, i }) => `[${i + 1}] ${s.sourceName ?? "source"} chunk ${s.chunk ?? "n/a"} had ${s.redactions} value${s.redactions === 1 ? "" : "s"} replaced`)
                          .join("; ")}
                        . They were replaced before the text was embedded, so the model never saw them.
                      </span>
                    </div>
                  ) : (
                    <div className="banner info">
                      <span>No PII markers in these chunks.</span>
                    </div>
                  )}
                  {current.piiRedacted > 0 && (
                    <div className="banner warn">
                      <span>
                        <b>{current.piiRedacted} value{current.piiRedacted === 1 ? "" : "s"} redacted from the answer</b> before it left the server.
                      </span>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
