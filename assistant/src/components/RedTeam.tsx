"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import type { RedTeamReport } from "@/lib/redteam";

export default function RedTeam() {
  const [report, setReport] = useState<RedTeamReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function run() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/redteam", { method: "POST" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setError(`Self-test failed (${res.status})`);
        return;
      }
      setReport((await res.json()) as RedTeamReport);
    } catch {
      setError("Network error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="tile" aria-labelledby="rt-title">
      <div className="action-row">
        <div>
          <h2 id="rt-title">Red-team self-test</h2>
          <p>
            Sends a fixed set of injection, PII and benign inputs through the ingest guard and the redactor. Encoded and
            obfuscated attacks the pattern checks miss are listed as gaps.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" type="button" onClick={run} disabled={running}>
          <Play aria-hidden /> {running ? "Running…" : report ? "Run again" : "Run self-test"}
        </button>
      </div>

      {error && <div className="banner bad" role="alert" style={{ marginTop: 14 }}><span>{error}</span></div>}

      {report && (
        <>
          <div className={`banner ${report.failed === 0 ? "ok" : "warn"}`} role="status" style={{ margin: "14px 0" }}>
            <span>
              <b>{report.passed} / {report.total} caught ({report.score}%)</b> · {report.failed} known gap{report.failed === 1 ? "" : "s"} · ran{" "}
              {report.ranAt.slice(11, 19)} UTC
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Category</th><th>Case</th><th>Expected</th><th>Outcome</th><th>Result</th></tr>
              </thead>
              <tbody>
                {report.results.map((r) => (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{r.category}</td>
                    <td>{r.name}</td>
                    <td className="muted">{r.expect}</td>
                    <td className="muted">{r.outcome}</td>
                    <td>{r.passed ? <span className="badge b-teal">pass</span> : <span className="badge b-red">gap</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
