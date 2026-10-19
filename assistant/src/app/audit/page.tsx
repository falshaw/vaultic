import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyChain } from "@/lib/audit";
import Nav from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const integrity = await verifyChain();
  const uniqueSources = new Set<string>();
  for (const r of rows) if (Array.isArray(r.sources)) for (const s of r.sources as { sourceName?: string }[]) if (s?.sourceName) uniqueSources.add(s.sourceName);
  const weekAgo = Date.now() - 7 * 864e5;
  const last7 = rows.filter((r) => r.createdAt.getTime() >= weekAgo).length;

  return (
    <div className="shell">
      <Nav email={session.email} role={session.role} current="audit" />
      <main className="main">
        <div className="page-head">
          <h1>Audit trail</h1>
          <p>Every question, answer and the exact sources used — append-only and tamper-evident. Showing the {rows.length} most recent.</p>
        </div>
        <div className="metrics">
          <div className="metric"><div className="m-label">Entries</div><div className="m-val">{rows.length}</div></div>
          <div className="metric"><div className="m-label">Chain integrity</div><div className={`m-val ${integrity.ok ? "ok" : "bad"}`}>{integrity.ok ? "100%" : "BROKEN"}</div></div>
          <div className="metric"><div className="m-label">Sources cited</div><div className="m-val accent">{uniqueSources.size}</div></div>
          <div className="metric"><div className="m-label">Last 7 days</div><div className="m-val">{last7}</div></div>
        </div>
        <div className="card">
          <div className="row-between">
            <div className={`badge ${integrity.ok ? "badge-ok" : "badge-bad"}`}>
              {integrity.ok
                ? `✓ Integrity verified — SHA-256 hash chain intact across ${integrity.entries} entr${integrity.entries === 1 ? "y" : "ies"}`
                : `✗ Integrity BROKEN — chain mismatch at entry ${integrity.brokenAt}`}
            </div>
            <a className="btn btn-primary" href="/api/evidence">Export evidence pack</a>
          </div>

        <table className="audit-table">
          <thead>
            <tr>
              <th>Time (UTC)</th><th>User</th><th>Question</th><th>Answer</th><th>Sources</th><th>Model</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="muted">No interactions logged yet.</td></tr>
            )}
            {rows.map((r) => {
              const srcCount = Array.isArray(r.sources) ? r.sources.length : 0;
              return (
                <tr key={r.id}>
                  <td className="nowrap">{new Date(r.createdAt).toISOString().slice(0, 19).replace("T", " ")}</td>
                  <td>{r.userEmail}</td>
                  <td>{r.question}</td>
                  <td>{r.answer.slice(0, 160)}{r.answer.length > 160 ? "…" : ""}</td>
                  <td>{srcCount}</td>
                  <td>{r.model}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </main>
    </div>
  );
}
