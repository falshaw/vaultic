import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getEgressManifest } from "@/lib/egress";
import Shell from "@/components/Shell";
import RedTeam from "@/components/RedTeam";

export const dynamic = "force-dynamic";
export const metadata = { title: "Security" };

export default async function SecurityPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const m = getEgressManifest();
  const internal = m.endpoints.length - m.externalCount;

  return (
    <Shell email={session.email} role={session.role}>
      <div className="top-row">
        <div>
          <div className="eyebrow">Admin · containment</div>
          <h1>Security</h1>
          <p>
            The endpoints the answer path is configured to call, a firewall pack that enforces default-deny egress, the
            build-time SBOM, and a self-test of the injection and PII guards.
          </p>
        </div>
      </div>

      <div className="stats">
        <div className="stat-card"><div className="eyebrow">Endpoints</div><b>{m.endpoints.length}</b></div>
        <div className="stat-card"><div className="eyebrow">Internal</div><b className="ok">{internal}</b></div>
        <div className="stat-card"><div className="eyebrow">External</div><b className={m.externalCount ? "bad" : undefined}>{m.externalCount}</b></div>
        <div className="stat-card"><div className="eyebrow">Config verdict</div><b className={m.airGapCompatible ? "ok" : "bad"}>{m.airGapCompatible ? "Internal only" : "Review"}</b></div>
      </div>

      <div className="sec-grid">
        <section className="tile" aria-labelledby="egress-title">
          <div className="action-row" style={{ marginBottom: 14 }}>
            <div>
              <h2 id="egress-title">Egress endpoints</h2>
              <p>
                Read from the running configuration and classified by host. This is a configuration check, not a live
                probe: apply the containment pack to enforce it at the network layer.
              </p>
            </div>
            <a className="btn btn-primary btn-sm" href="/api/firewall-rules" download>
              <Download aria-hidden /> Containment pack
            </a>
          </div>
          <div className={`banner ${m.airGapCompatible ? "ok" : "bad"}`} style={{ marginBottom: 14 }}>
            <span aria-hidden>{m.airGapCompatible ? "✓" : "✗"}</span>
            <span>
              {m.airGapCompatible
                ? "No external endpoint on the answer path."
                : `${m.externalCount} external endpoint${m.externalCount === 1 ? "" : "s"} configured. Review before relying on containment.`}
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Service</th><th>Endpoint</th><th>Purpose</th><th>Scope</th></tr>
              </thead>
              <tbody>
                {m.endpoints.map((e) => (
                  <tr key={e.name}>
                    <td>{e.name}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{e.host}{e.port ? `:${e.port}` : ""}</td>
                    <td className="muted">{e.purpose}</td>
                    <td>{e.scope === "internal" ? <span className="badge b-teal">internal</span> : <span className="badge b-red">external</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="tile" aria-labelledby="sbom-title">
          <div className="action-row">
            <div>
              <h2 id="sbom-title">Software bill of materials</h2>
              <p>CycloneDX SBOM of the runtime npm dependencies, generated when the image was built.</p>
            </div>
            <a className="btn btn-ghost btn-sm" href="/api/sbom" download>
              <Download aria-hidden /> SBOM (CycloneDX JSON)
            </a>
          </div>
        </section>

        <RedTeam />
      </div>
    </Shell>
  );
}
