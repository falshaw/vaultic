import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EVENT_COLLECTIONS, verifyChain } from "@/lib/audit";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit" };

/** Entries since a cutoff; kept outside render so the component stays pure. */
function countSince(rows: { createdAt: Date }[], days: number) {
  const cutoff = Date.now() - days * 864e5;
  return rows.filter((r) => r.createdAt.getTime() >= cutoff).length;
}

const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

export default async function AuditPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const [rows, total, chain] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200 }),
    prisma.auditLog.count(),
    verifyChain(),
  ]);
  // Documents an answer actually cited (entries written before the cited flag count every source).
  const sources = new Set<string>();
  for (const r of rows) {
    if (EVENT_COLLECTIONS.includes(r.collection) || !Array.isArray(r.sources)) continue;
    for (const s of r.sources as { sourceName?: string; cited?: boolean }[]) {
      if (s?.sourceName && s.cited !== false) sources.add(s.sourceName);
    }
  }
  const last7 = countSince(rows, 7);

  return (
    <Shell email={session.email} role={session.role}>
      <div className="top-row">
        <div>
          <div className="eyebrow">Admin · append-only</div>
          <h1>Audit</h1>
          <p>
            Every question, answer, model and source set, plus security events (lockouts) and admin actions (uploads,
            deletions, visibility and user changes), in a SHA-256 hash chain. Changing any
            past row breaks the chain.{total > rows.length ? ` Showing the latest ${rows.length} of ${total}.` : ""}
          </p>
        </div>
        <div className="tools">
          <a className="btn btn-primary btn-sm" href="/api/evidence" download>
            <Download aria-hidden /> Evidence pack
          </a>
        </div>
      </div>

      <div className="stats">
        <div className="stat-card"><div className="eyebrow">Entries</div><b>{total}</b></div>
        <div className="stat-card"><div className="eyebrow">Chain</div><b className={chain.ok ? "ok" : "bad"}>{chain.ok ? "Verified" : "Broken"}</b></div>
        <div className="stat-card"><div className="eyebrow">Documents cited</div><b className="accent">{sources.size}</b></div>
        <div className="stat-card"><div className="eyebrow">Last 7 days</div><b>{last7}</b></div>
      </div>

      <div className={`banner ${chain.ok ? "ok" : "bad"}`} role="status" style={{ marginBottom: 16 }}>
        <span aria-hidden>{chain.ok ? "✓" : "✗"}</span>
        <span>
          {chain.ok
            ? chain.entries === 0
              ? "Chain empty: nothing logged yet."
              : `Hash chain verified across ${chain.entries} entr${chain.entries === 1 ? "y" : "ies"}, just now.`
            : `Hash chain broken at entry ${chain.entries} (id ${chain.brokenAt}). A row was changed or removed.`}
        </span>
      </div>

      <section className="tile" aria-label="Audit entries">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>User</th>
                <th>Question</th>
                <th>Answer</th>
                <th>Sources</th>
                <th>Model</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">
                      <b>Nothing logged yet</b>
                      Questions asked in the Workbench appear here.
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const security = r.collection === "security";
                const admin = r.collection === "admin";
                const list = Array.isArray(r.sources) ? (r.sources as { cited?: boolean }[]) : [];
                const cited = list.filter((s) => s?.cited !== false).length;
                return (
                  <tr key={r.id}>
                    <td className="when">{fmt(r.createdAt)}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.userEmail}</td>
                    <td>
                      {security && <span className="badge b-amber" style={{ marginBottom: 4 }}>security</span>}
                      {admin && <span className="badge b-blue" style={{ marginBottom: 4 }}>admin</span>}
                      <div className="clip">{r.question.replace(/^\[(security|admin)\]\s*/, "")}</div>
                    </td>
                    <td><div className="clip muted">{r.answer}</div></td>
                    <td className="num" title={security || admin ? undefined : "cited / retrieved"}>
                      {security || admin ? "–" : `${cited} / ${list.length}`}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.model}</td>
                    <td className="mono faint" style={{ fontSize: 12 }} title={r.entryHash}>{r.entryHash.slice(0, 10)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}
