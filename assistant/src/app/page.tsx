import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDashboard } from "@/lib/metrics";
import Nav from "@/components/Nav";
import { StatTile, AreaChart, Ring, BarList } from "@/components/charts";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { query: "Query answered", indexed: "Document indexed", quarantined: "Document quarantined" };

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  const d = await getDashboard();

  return (
    <div className="shell">
      <Nav email={session.email} role={session.role} current="overview" />
      <main className="main">
        <div className="dash-head">
          <div>
            <h1>Overview</h1>
            <p>Live security posture across your private knowledge base — every figure derived from on-box data.</p>
          </div>
          <div className="head-right">
            <span className="time-pill is-active">14d</span>
            <span className={`airgap-pill ${d.airGap ? "ok" : "bad"}`}>
              <span className="agp-dot" /> {d.airGap ? "AIR-GAPPED" : "EGRESS DETECTED"}
            </span>
          </div>
        </div>

        <div className="dash">
          {/* KPI strip */}
          {d.kpis.map((k) => (
            <div className="col-3" key={k.label}><StatTile kpi={k} /></div>
          ))}

          {/* Hero split: time-series + status rings */}
          <div className="col-8">
            <div className="card chart-card">
              <div className="card-head">
                <h2>Queries / day</h2>
                <span className="card-tag">last 14 days</span>
              </div>
              <AreaChart data={d.series} />
            </div>
          </div>
          <div className="col-4">
            <div className="card rings-card">
              <div className="card-head"><h2>Security posture</h2></div>
              {d.rings.map((r) => <Ring ring={r} key={r.label} />)}
            </div>
          </div>

          {/* Analytics row: threats + sources */}
          <div className="col-6">
            <div className="card">
              <div className="card-head"><h2>Threats blocked</h2><span className="card-tag">by type</span></div>
              <BarList items={d.threats} tone="red" />
            </div>
          </div>
          <div className="col-6">
            <div className="card">
              <div className="card-head"><h2>Top sources</h2><span className="card-tag">most cited</span></div>
              <BarList items={d.sources} tone="gold" />
            </div>
          </div>

          {/* Activity feed */}
          <div className="col-12">
            <div className="card">
              <div className="card-head"><h2>Recent activity</h2><span className="card-tag">{d.activity.length} events</span></div>
              {d.activity.length === 0 ? (
                <div className="muted" style={{ marginTop: 14 }}>No activity yet — index a document or ask a question.</div>
              ) : (
                <div className="feed">
                  {d.activity.map((a, i) => (
                    <div className="feed-row" key={i}>
                      <span className={`feed-dot ${a.kind}`} />
                      <span className="feed-time">{a.at.toISOString().slice(5, 16).replace("T", " ")}</span>
                      <span className="feed-kind">{KIND_LABEL[a.kind]}</span>
                      <span className="feed-detail">{a.detail}</span>
                      <span className="feed-actor">{a.actor}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
