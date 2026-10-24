import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Shell from "@/components/Shell";
import DocumentActions from "@/components/DocumentActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents" };

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export default async function DocumentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const docs = await prisma.document.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const indexed = docs.filter((d) => !d.quarantined).length;
  const quarantined = docs.length - indexed;
  const pii = docs.reduce((a, d) => a + d.piiRedactions, 0);

  return (
    <Shell email={session.email} role={session.role}>
      <div className="top-row">
        <div>
          <div className="eyebrow">Admin · knowledge base</div>
          <h1>Documents</h1>
          <p>
            Every upload is screened for prompt injection and PII before storage. Quarantined files are kept out of
            retrieval.
          </p>
        </div>
        <div className="tools">
          <Link className="btn btn-ghost btn-sm" href="/workbench">Add document</Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat-card"><div className="eyebrow">Uploads</div><b>{docs.length}</b></div>
        <div className="stat-card"><div className="eyebrow">Indexed</div><b className="accent">{indexed}</b></div>
        <div className="stat-card"><div className="eyebrow">Quarantined</div><b className={quarantined ? "bad" : undefined}>{quarantined}</b></div>
        <div className="stat-card"><div className="eyebrow">PII redacted</div><b className="ok">{pii}</b></div>
      </div>

      <section className="tile" aria-label="Documents">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Added (UTC)</th>
                <th>Source</th>
                <th>Access</th>
                <th>Chunks</th>
                <th>PII</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">
                      <b>No documents yet</b>
                      Add one from the Workbench.
                    </div>
                  </td>
                </tr>
              )}
              {docs.map((d) => {
                const rules = Array.isArray(d.injectionFindings)
                  ? [...new Set((d.injectionFindings as { rule?: string }[]).map((f) => f?.rule).filter(Boolean))]
                  : [];
                return (
                  <tr key={d.id}>
                    <td className="when">{fmt(d.createdAt)}</td>
                    <td><span className="src">{d.sourceName}</span></td>
                    <td>
                      {d.visibility === "admin" ? <span className="badge b-amber">admins only</span> : <span className="badge b-blue">all users</span>}
                    </td>
                    <td className="num">{d.chunks}</td>
                    <td className="num">{d.piiRedactions}</td>
                    <td>
                      {d.quarantined ? (
                        <>
                          <span className="badge b-red">quarantined</span>
                          {rules.length > 0 && <div className="faint mono" style={{ fontSize: 11.5, marginTop: 4 }}>{rules.join(", ")}</div>}
                        </>
                      ) : (
                        <span className="badge b-teal">indexed</span>
                      )}
                    </td>
                    <td>
                      <DocumentActions id={d.id} name={d.sourceName} visibility={d.visibility} quarantined={d.quarantined} />
                    </td>
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
