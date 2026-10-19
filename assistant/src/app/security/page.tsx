import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getEgressManifest } from "@/lib/egress";
import Nav from "@/components/Nav";
import RedTeam from "@/components/RedTeam";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const m = getEgressManifest();
  const internal = m.endpoints.length - m.externalCount;

  return (
    <div className="shell">
      <Nav email={session.email} role={session.role} current="security" />
      <main className="main">
        <div className="page-head">
          <h1>Containment &amp; egress</h1>
          <p>Vaultic&rsquo;s answer path talks only to services on its own box. Apply the firewall pack to enforce default-deny egress — then &ldquo;data never leaves&rdquo; is provable, not a claim.</p>
        </div>
        <div className="metrics">
          <div className="metric"><div className="m-label">Endpoints</div><div className="m-val">{m.endpoints.length}</div></div>
          <div className="metric"><div className="m-label">Internal</div><div className="m-val ok">{internal}</div></div>
          <div className="metric"><div className="m-label">External</div><div className={`m-val ${m.externalCount ? "bad" : ""}`}>{m.externalCount}</div></div>
          <div className="metric"><div className="m-label">Egress</div><div className={`m-val ${m.airGapCompatible ? "ok" : "bad"}`}>{m.airGapCompatible ? "BLOCKED" : "OPEN"}</div></div>
        </div>
        <div className="card">
          <div className="row-between">
            <div className={`badge ${m.airGapCompatible ? "badge-ok" : "badge-bad"}`}>
              {m.airGapCompatible
                ? "✓ Air-gap compatible — 0 external endpoints in the answer path"
                : `✗ ${m.externalCount} external endpoint(s) configured — review`}
            </div>
            <a className="btn btn-primary" href="/api/firewall-rules">Export containment pack</a>
          </div>

        <table className="audit-table">
          <thead>
            <tr><th>Service</th><th>Endpoint</th><th>Purpose</th><th>Scope</th></tr>
          </thead>
          <tbody>
            {m.endpoints.map((e) => (
              <tr key={e.name}>
                <td>{e.name}</td>
                <td className="nowrap">{e.host}{e.port ? `:${e.port}` : ""}</td>
                <td>{e.purpose}</td>
                <td>
                  {e.scope === "internal"
                    ? <span className="badge badge-ok">internal</span>
                    : <span className="badge badge-bad">external</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
          The pack includes ready-to-apply iptables / nftables / Windows-Firewall rules (default-deny egress for
          Vaultic&rsquo;s Docker network) plus a one-command check that egress is actually blocked.
        </p>
        </div>

        <div className="card">
          <div className="row-between">
            <div>
              <h2>Software bill of materials</h2>
              <div className="sub">A real CycloneDX SBOM of the runtime dependencies, generated at build — for supply-chain review and vendor risk.</div>
            </div>
            <a className="btn btn-primary" href="/api/sbom">Download SBOM (CycloneDX)</a>
          </div>
        </div>

        <RedTeam />
      </main>
    </div>
  );
}
