import type { ChainStatus } from "@/lib/audit";

/**
 * Two concentric rings: outer = audit hash chain (full when it verifies, red when
 * broken, empty when there are no entries), inner = share of red-team cases the
 * guards catch. Egress is a count, so it sits in the legend only.
 */
export function PostureRings({
  chain,
  redteam,
  egress,
}: {
  chain: ChainStatus;
  redteam: { passed: number; total: number };
  egress: { internal: number; total: number; airGap: boolean };
}) {
  const outer = { r: 60, w: 12 };
  const inner = { r: 44, w: 8 };
  const c1 = 2 * Math.PI * outer.r;
  const c2 = 2 * Math.PI * inner.r;
  const empty = chain.entries === 0;
  const chainColor = chain.ok ? "var(--accent)" : "var(--red)";
  const rtShare = redteam.total ? redteam.passed / redteam.total : 0;
  const center = empty ? "Empty" : chain.ok ? "Intact" : "Broken";
  const sub = `${chain.entries} entr${chain.entries === 1 ? "y" : "ies"}`;

  return (
    <div className="posture">
      <svg
        width="136"
        height="136"
        viewBox="0 0 150 150"
        role="img"
        aria-label={`Audit chain ${center.toLowerCase()}, ${sub}. Red-team ${redteam.passed} of ${redteam.total} caught.`}
      >
        <circle cx="75" cy="75" r={outer.r} fill="none" stroke="var(--track)" strokeWidth={outer.w} />
        {!empty && (
          <circle
            cx="75" cy="75" r={outer.r} fill="none" stroke={chainColor} strokeWidth={outer.w}
            strokeDasharray={c1} strokeDashoffset={0} transform="rotate(-90 75 75)"
          />
        )}
        <circle cx="75" cy="75" r={inner.r} fill="none" stroke="var(--track)" strokeWidth={inner.w} />
        {rtShare > 0 && (
          <circle
            cx="75" cy="75" r={inner.r} fill="none" stroke="var(--teal)" strokeWidth={inner.w} strokeLinecap="round"
            strokeDasharray={c2} strokeDashoffset={c2 * (1 - rtShare)} transform="rotate(-90 75 75)"
          />
        )}
        <text x="75" y="76" textAnchor="middle" fontWeight="700" fontSize="18" fill={chain.ok ? "var(--ink)" : "var(--red)"}>
          {center}
        </text>
        <text x="75" y="94" textAnchor="middle" fontSize="10.5" fill="var(--ink-45)">{sub}</text>
      </svg>
      <div className="leg">
        <div>
          <span style={{ "--c": chainColor } as React.CSSProperties}>
            Audit chain<b>{empty ? "No entries" : chain.ok ? "Verified" : "Broken"}</b>
          </span>
          <em style={{ color: chain.ok ? "var(--teal)" : "var(--red)" }}>SHA-256</em>
        </div>
        <div>
          <span style={{ "--c": "var(--teal)" } as React.CSSProperties}>
            Red-team<b>{redteam.passed} / {redteam.total}</b>
          </span>
          <em style={{ color: "var(--teal)" }}>caught</em>
        </div>
        <div>
          <span style={{ "--c": "var(--amber)" } as React.CSSProperties}>
            Egress<b>{egress.internal} / {egress.total}</b>
          </span>
          <em style={{ color: egress.airGap ? "var(--teal)" : "var(--red)" }}>internal</em>
        </div>
      </div>
    </div>
  );
}
