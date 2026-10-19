"use client";

import { useState } from "react";
import type { RedTeamReport } from "@/lib/redteam";

export default function RedTeam() {
  const [report, setReport] = useState<RedTeamReport | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch("/api/redteam", { method: "POST" });
      setReport((await res.json()) as RedTeamReport);
    } catch {
      /* ignore */
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h2>Red-team self-test</h2>
          <div className="sub">
            Fires adversarial inputs at Vaultic&rsquo;s own injection + PII defenses and scores what&rsquo;s caught.
            Includes obfuscated attacks the pattern detectors miss — reported honestly as gaps. Defense-in-depth, not a WAF.
          </div>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={running} style={{ whiteSpace: "nowrap" }}>
          {running ? "Running…" : "Run self-test"}
        </button>
      </div>

      {report && (
        <>
          <div className={`badge ${report.score >= 80 ? "badge-ok" : "badge-bad"}`} style={{ marginTop: 12 }}>
            {report.passed}/{report.total} passed · {report.score}% · {report.failed} known gap{report.failed === 1 ? "" : "s"}
          </div>
          <table className="audit-table">
            <thead>
              <tr><th>Category</th><th>Test</th><th>Expected</th><th>Outcome</th><th>Result</th></tr>
            </thead>
            <tbody>
              {report.results.map((r) => (
                <tr key={r.id}>
                  <td>{r.category}</td>
                  <td>{r.name}</td>
                  <td>{r.expect}</td>
                  <td>{r.outcome}</td>
                  <td>{r.passed ? <span className="badge badge-ok">pass</span> : <span className="badge badge-bad">gap</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
