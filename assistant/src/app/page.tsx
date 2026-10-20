import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDashboard, type Activity, type ActivityKind } from "@/lib/metrics";
import Shell from "@/components/Shell";
import { PostureRings } from "@/components/PostureRings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const KIND: Record<ActivityKind, { pill: string; label: string; tone: string; icon: React.ReactNode }> = {
  query: { pill: "p-query", label: "Query", tone: "accent", icon: <path d="M4 4h16v12H9l-5 4z" /> },
  indexed: { pill: "p-ok", label: "Indexed", tone: "teal", icon: <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /></> },
  quarantined: { pill: "p-risk", label: "Quarantined", tone: "red", icon: <><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></> },
  security: { pill: "p-flag", label: "Security", tone: "amber", icon: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></> },
};

const fmtDate = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const fmtDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function when(at: Date, now: Date) {
  return at.toISOString().slice(0, 10) === now.toISOString().slice(0, 10) ? fmtTime.format(at) : fmtDay.format(at);
}

function ActivityRow({ a, now }: { a: Activity; now: Date }) {
  const k = KIND[a.kind];
  const mono = a.kind === "indexed" || a.kind === "quarantined";
  return (
    <div className="ch">
      <div className="ico" style={{ background: `var(--${k.tone}-soft)`, color: `var(--${k.tone})` }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>{k.icon}</svg>
      </div>
      <div>
        <b className={mono ? "mono" : undefined} title={a.title}>{a.title}</b>
        <small title={a.detail}>{a.detail}</small>
      </div>
      <div className="r">
        <time className="hide-sm" dateTime={a.at.toISOString()}>{when(a.at, now)}</time>
        <span className={`pill ${k.pill}`}>{k.label}</span>
      </div>
    </div>
  );
}

export default async function Overview() {
  const session = await getSession();
  if (!session) redirect("/login");
  const d = await getDashboard({ userId: session.userId, role: session.role });
  const now = new Date();
  const max = Math.max(...d.week.map((w) => w.value), 1);
  const srcMax = Math.max(...d.sources.map((s) => s.value), 1);

  const kpis = [
    { label: "Queries", value: d.queries, tone: "accent", icon: <path d="M4 4h16v12H9l-5 4z" /> },
    { label: "Documents indexed", value: d.indexed, tone: "teal", icon: <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /></> },
    { label: "Threats blocked", value: d.quarantined, tone: "red", icon: <><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></> },
    { label: "PII redactions", value: d.piiRedactions, tone: "amber", icon: <><rect x="4" y="10" width="16" height="4" rx="1" /><path d="M4 6h10M4 18h7" /></> },
  ];

  return (
    <Shell email={session.email} role={session.role}>
      <div className="top-row">
        <div>
          <div className="eyebrow">
            {fmtDate.format(now)} · {d.egress.airGap ? "no external endpoints" : "external endpoint configured"}
          </div>
          <h1>Overview</h1>
        </div>
        <div className="tools hide-sm">
          <Link className="chip search-chip" href="/workbench">⌕ Ask your documents…</Link>
        </div>
      </div>

      <div className="ov-grid">
        <section className="tile" aria-labelledby="qpd">
          <div className="tile-h">
            <h2 id="qpd">Queries / day</h2>
            <span className="chip">last 7 days · {d.weekTotal} total</span>
          </div>
          <div className="bars" role="img" aria-label={`Queries per day, last 7 days: ${d.week.map((w) => `${w.label} ${w.value}`).join(", ")}`}>
            {d.week.map((w) => {
              const h = Math.round((w.value / max) * 100);
              const inside = h >= 88;
              return (
                <div key={w.key}>
                  <div className={`col${w.today ? " today" : ""}`}>
                    {w.value > 0 && <b style={{ height: `${Math.max(h, 4)}%` }} />}
                    <span className={inside ? "in" : undefined} style={inside ? { top: 8 } : { bottom: `calc(${w.value > 0 ? Math.max(h, 4) : 0}% + 6px)` }}>
                      {w.value}
                    </span>
                  </div>
                  <small>{w.today ? "Today" : w.label}</small>
                </div>
              );
            })}
          </div>
        </section>

        <div className="kstack">
          {kpis.map((k) => (
            <div className="tile kpi" key={k.label}>
              <div className="i" style={{ color: `var(--${k.tone})` }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>{k.icon}</svg>
              </div>
              <div>
                <b>{k.value.toLocaleString("en-GB")}</b>
                <small>{k.label}</small>
              </div>
            </div>
          ))}
        </div>

        <section className="tile" aria-labelledby="posture">
          <div className="tile-h">
            <h2 id="posture">Security posture</h2>
            <span className="chip">checked now</span>
          </div>
          <PostureRings chain={d.chain} redteam={d.redteam} egress={d.egress} />
        </section>
      </div>

      <div className="row2">
        <section className="tile" aria-labelledby="recent">
          <div className="tile-h">
            <h2 id="recent">Recent activity</h2>
            {session.role === "admin" && (
              <Link className="chip" style={{ color: "var(--accent)", fontWeight: 600 }} href="/audit">Audit log</Link>
            )}
          </div>
          {d.activity.length === 0 ? (
            <div className="empty">
              <b>No activity yet</b>
              Index a document or ask a question in the Workbench.
            </div>
          ) : (
            d.activity.map((a, i) => <ActivityRow a={a} now={now} key={i} />)
          )}
        </section>

        <section className="tile" aria-labelledby="top">
          <div className="tile-h">
            <h2 id="top">Top sources</h2>
            <span className="chip">most cited</span>
          </div>
          {d.sources.length === 0 ? (
            <div className="empty">
              <b>No citations yet</b>
              Documents appear here once answers cite them.
            </div>
          ) : (
            d.sources.map((s, i) => (
              <div className="vp" key={s.label}>
                <span title={s.label}>{s.label}</span>
                <i><b style={{ width: `${(s.value / srcMax) * 100}%`, background: i < 3 ? undefined : "var(--teal)" }} /></i>
                <b>{s.value}</b>
              </div>
            ))
          )}
        </section>
      </div>

      <div className="cta">
        <div style={{ position: "relative", zIndex: 1 }}>
          <h3>Open the workbench</h3>
          <p>
            {d.indexed === 0
              ? "No documents indexed yet. Add one, then ask a question about it."
              : `Ask across ${d.indexed} indexed document${d.indexed === 1 ? "" : "s"}. Answers cite the passages and go into the audit chain.`}
          </p>
        </div>
        <Link className="btn" href="/workbench">Open workbench</Link>
      </div>
    </Shell>
  );
}
