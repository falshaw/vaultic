import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Nav from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const docs = await prisma.document.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const indexed = docs.filter((d) => !d.quarantined).length;
  const quarantined = docs.filter((d) => d.quarantined).length;
  const piiTotal = docs.reduce((a, d) => a + d.piiRedactions, 0);

  return (
    <div className="shell">
      <Nav email={session.email} role={session.role} current="documents" />
      <main className="main">
        <div className="page-head">
          <h1>Knowledge base</h1>
          <p>Documents indexed on this box. Each is screened for prompt-injection/poisoning and PII before storage; quarantined items are kept out of retrieval.</p>
        </div>
        <div className="metrics">
          <div className="metric"><div className="m-label">Documents</div><div className="m-val">{docs.length}</div></div>
          <div className="metric"><div className="m-label">Indexed</div><div className="m-val accent">{indexed}</div></div>
          <div className="metric"><div className="m-label">Quarantined</div><div className="m-val bad">{quarantined}</div></div>
          <div className="metric"><div className="m-label">PII redacted</div><div className="m-val ok">{piiTotal}</div></div>
        </div>
        <div className="card">
        <table className="audit-table">
          <thead>
            <tr><th>Indexed (UTC)</th><th>Source</th><th>Access</th><th>Chunks</th><th>PII redacted</th><th>Status</th></tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr><td colSpan={6} className="muted">No documents yet — index one from the Workbench.</td></tr>
            )}
            {docs.map((d) => (
              <tr key={d.id}>
                <td className="nowrap">{new Date(d.createdAt).toISOString().slice(0, 19).replace("T", " ")}</td>
                <td>{d.sourceName}</td>
                <td>
                  {d.visibility === "admin"
                    ? <span className="badge badge-bad">admins only</span>
                    : <span className="badge badge-ok">all users</span>}
                </td>
                <td>{d.chunks}</td>
                <td>{d.piiRedactions}</td>
                <td>
                  {d.quarantined
                    ? <span className="badge badge-bad">quarantined</span>
                    : <span className="badge badge-ok">indexed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </main>
    </div>
  );
}
