"use client";

import { useState } from "react";
import Nav from "@/components/Nav";

interface Cite { sourceName?: string; chunk?: number; score?: number; snippet?: string; }
interface Msg { role: "user" | "ai"; text: string; cites?: Cite[]; }

export default function Workbench({ email, role }: { email: string; role: "admin" | "user" }) {
  const [log, setLog] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);

  const [srcName, setSrcName] = useState("");
  const [srcText, setSrcText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<"all" | "admin">("all");
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState("");

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question || asking) return;
    // user message + an empty AI placeholder we stream into
    setLog((l) => [...l, { role: "user", text: question }, { role: "ai", text: "", cites: [] }]);
    setQ("");
    setAsking(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        updateLast((m) => ({ ...m, text: `Error: ${j.error ?? res.status}` }));
        return;
      }
      // Read the NDJSON stream: {type:"sources"|"token"|"error"|"done"} per line.
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
          let ev: { type: string; sources?: Cite[]; text?: string; error?: string };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === "sources") updateLast((m) => ({ ...m, cites: ev.sources ?? [] }));
          else if (ev.type === "token") updateLast((m) => ({ ...m, text: m.text + (ev.text ?? "") }));
          else if (ev.type === "error") updateLast((m) => ({ ...m, text: m.text + `\n[generation error: ${ev.error}]` }));
        }
      }
    } catch {
      updateLast((m) => ({ ...m, text: m.text || "Network error" }));
    } finally {
      setAsking(false);
    }
  }

  function updateLast(fn: (m: Msg) => Msg) {
    setLog((l) => {
      if (l.length === 0) return l;
      const copy = l.slice();
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });
  }

  async function ingest(e: React.FormEvent) {
    e.preventDefault();
    if (ingesting || (!file && !srcText.trim())) return;
    setIngesting(true);
    setIngestMsg("");
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
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setIngestMsg(j.warning ?? `Indexed “${j.sourceName}” (${j.chunks ?? "?"} chunks).`);
        if (!j.quarantined) { setSrcText(""); setSrcName(""); setFile(null); }
      } else {
        setIngestMsg(`Error: ${j.error ?? res.status}`);
      }
    } catch {
      setIngestMsg("Network error");
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div className="shell">
      <Nav email={email} role={role} current="workbench" />
      <main className="main">
        <div className="page-head">
          <h1>Workbench</h1>
          <p>Index your documents, then ask — answered locally from your own sources, every exchange logged.</p>
        </div>

        <div className="grid">
        {/* Ingest */}
        <div className="card">
          <h2>Knowledge</h2>
          <div className="sub">Index a document. It stays on this box — embedded locally, stored in your own vector store.</div>
          <form onSubmit={ingest}>
            <div className="field">
              <label>Upload a file (PDF, TXT, MD, CSV)</label>
              <input
                className="input"
                type="file"
                accept=".pdf,.txt,.md,.csv,.json,application/pdf,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !srcName) setSrcName(f.name);
                }}
              />
            </div>
            <div className="field">
              <label>Source name</label>
              <input className="input" value={srcName} onChange={(e) => setSrcName(e.target.value)} placeholder="e.g. AML-Policy-2026.pdf" />
            </div>
            <div className="field">
              <label>Who can retrieve this</label>
              <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as "all" | "admin")}>
                <option value="all">All users</option>
                <option value="admin">Admins only</option>
              </select>
            </div>
            <div className="field">
              <label>{file ? "Document text (a file is selected — text ignored)" : "…or paste document text"}</label>
              <textarea className="textarea" value={srcText} onChange={(e) => setSrcText(e.target.value)} placeholder="Paste the document contents to index…" style={{ minHeight: 140 }} disabled={!!file} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={ingesting} style={{ width: "100%" }}>
              {ingesting ? "Indexing…" : file ? "Index file" : "Index document"}
            </button>
            {ingestMsg && <div className="muted" style={{ marginTop: 10 }}>{ingestMsg}</div>}
          </form>
        </div>

        {/* Chat */}
        <div className="card">
          <h2>Ask your documents</h2>
          <div className="sub">Answers come only from your indexed documents, with sources. Every exchange is logged.</div>
          <div className="chat-log">
            {log.length === 0 && <div className="muted">Index a document, then ask a question about it.</div>}
            {log.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.text || (m.role === "ai" ? <span className="muted">Thinking…</span> : null)}
                {m.role === "ai" && m.cites && m.cites.length > 0 && (
                  <div className="cites">
                    <div className="lbl">Sources</div>
                    {m.cites.map((c, j) => (
                      <div className="cite" key={j}>
                        <b>{c.sourceName ?? "source"}</b>{c.chunk != null ? ` · chunk ${c.chunk}` : ""}
                        {c.snippet ? ` — ${c.snippet.slice(0, 160)}…` : ""}
                      </div>
                    ))}
                  </div>
                )}
                {m.role === "ai" && m.text && <div className="audit-note"><span className="dot" /> logged to the audit trail</div>}
              </div>
            ))}
          </div>
          <form className="ask-row" onSubmit={ask}>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question about your documents…" />
            <button className="btn btn-primary" type="submit" disabled={asking}>Ask</button>
          </form>
        </div>
        </div>
      </main>
    </div>
  );
}
