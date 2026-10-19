import type { Kpi, Ring as RingData, BarItem } from "@/lib/metrics";

// Dependency-free inline-SVG chart primitives. Pure render (server components).
// Tuned to the "expensive dark dashboard" spec: gradient-fade area fills,
// near-invisible gridlines, last-point dot only, thin state-colored rings.

const toneVar = (t: string) => `var(--${t})`;

/* ── Sparkline (KPI tiles) — stretched, non-scaling stroke, no dots/axes ── */
export function Sparkline({ data, tone }: { data: number[]; tone: string }) {
  if (!data || data.length < 2) return <div className="spark-empty" />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const W = 200;
  const H = 38;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - 3 - ((v - min) / range) * (H - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke={toneVar(tone)}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ── KPI stat tile ── */
export function StatTile({ kpi }: { kpi: Kpi }) {
  const up = (kpi.deltaPct ?? 0) >= 0;
  return (
    <div className="stat" data-tone={kpi.tone}>
      <div className="stat-label">{kpi.label}</div>
      <div className="stat-row">
        <span className="stat-num">{kpi.display}</span>
        {kpi.deltaPct !== null && (
          <span className={`stat-delta ${up ? "up" : "down"}`}>
            {up ? "▲" : "▼"} {Math.abs(kpi.deltaPct)}%
          </span>
        )}
      </div>
      <Sparkline data={kpi.spark} tone={kpi.tone} />
    </div>
  );
}

/* ── Area time-series (hero) — uniform-scaled viewBox so text/dot stay round ── */
export function AreaChart({ data }: { data: { label: string; value: number }[] }) {
  const W = 1000;
  const H = 300;
  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const max = Math.max(...data.map((d) => d.value), 1);
  const x = (i: number) => padL + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => padT + ih - (v / max) * ih;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(data.length - 1).toFixed(1)} ${padT + ih} L ${x(0).toFixed(1)} ${padT + ih} Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: Math.round(max * t), gy: padT + ih - t * ih }));
  const lastI = data.length - 1;
  const xLabelEvery = Math.ceil(data.length / 7);

  return (
    <svg className="area" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Queries per day">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.26" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={t.gy} x2={W - padR} y2={t.gy} className="grid" vectorEffect="non-scaling-stroke" />
          <text x={padL - 8} y={t.gy + 4} className="axis y" textAnchor="end">{t.v}</text>
        </g>
      ))}
      <path d={area} fill="url(#areaGrad)" />
      <path d={line} fill="none" className="area-line" vectorEffect="non-scaling-stroke" />
      <circle cx={x(lastI)} cy={y(data[lastI].value)} r="5" className="area-dot" vectorEffect="non-scaling-stroke" />
      {data.map((d, i) =>
        i % xLabelEvery === 0 || i === lastI ? (
          <text key={i} x={x(i)} y={H - 8} className="axis x" textAnchor="middle">{d.label}</text>
        ) : null,
      )}
    </svg>
  );
}

/* ── Ring gauge — thin, visible track, state-colored ── */
export function Ring({ ring }: { ring: RingData }) {
  const state = ring.pct >= 90 ? "emerald" : ring.pct >= 60 ? "gold" : "red";
  const r = 42;
  const c = 2 * Math.PI * r;
  const off = c * (1 - ring.pct / 100);
  return (
    <div className="ring" data-state={state}>
      <div className="ring-svg">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} className="ring-track" />
          <circle
            cx="50"
            cy="50"
            r={r}
            className="ring-fill"
            style={{ stroke: toneVar(state), strokeDasharray: c, strokeDashoffset: off }}
          />
        </svg>
        <div className="ring-pct">{ring.pct}%</div>
      </div>
      <div className="ring-meta">
        <div className="ring-label">{ring.label}</div>
        <div className="ring-cap">{ring.caption}</div>
      </div>
    </div>
  );
}

/* ── Horizontal bar list ── */
export function BarList({ items, tone = "gold" }: { items: BarItem[]; tone?: string }) {
  if (!items.length) return <div className="muted" style={{ marginTop: 14 }}>No data yet.</div>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="barlist">
      {items.map((it, i) => (
        <div className="barrow" key={i}>
          <div className="barrow-top">
            <span className="barrow-label">{it.label}</span>
            <span className="barrow-val">{it.value.toLocaleString()}</span>
          </div>
          <div className="bartrack">
            <div className="barfill" data-tone={tone} style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
