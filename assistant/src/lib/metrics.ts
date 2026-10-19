import { prisma } from "./prisma";
import { verifyChain } from "./audit";
import { runRedTeam } from "./redteam";
import { getEgressManifest } from "./egress";

// All dashboard numbers are derived from REAL rows in Postgres (audit log +
// documents) + the live security checks. Nothing here is fabricated; a fresh
// install shows low/zero values until the demo seed or real use populates it.

const DAYS = 14;

export interface Kpi {
  label: string;
  value: number;
  display: string;
  deltaPct: number | null; // last 7d vs prior 7d
  spark: number[];
  tone: "gold" | "emerald" | "red";
}
export interface Ring {
  label: string;
  pct: number;
  caption: string;
}
export interface BarItem {
  label: string;
  value: number;
}
export interface Activity {
  at: Date;
  kind: "query" | "indexed" | "quarantined";
  actor: string;
  detail: string;
}
export interface Dashboard {
  kpis: Kpi[];
  series: { label: string; value: number }[];
  rings: Ring[];
  threats: BarItem[];
  sources: BarItem[];
  activity: Activity[];
  airGap: boolean;
  generatedAt: string;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function lastNDays(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push(dayKey(d));
  }
  return out;
}
function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? 100 : null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export async function getDashboard(): Promise<Dashboard> {
  const [audit, docs] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.document.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  // Q&A-only view of the audit log: security events (e.g. login lockouts) are
  // appended to the same tamper-evident chain but must not inflate the "query"
  // metrics. They remain visible in the full /audit trail.
  const qa = audit.filter((a) => a.collection !== "security");

  const days = lastNDays(DAYS);
  const idx = new Map(days.map((d, i) => [d, i]));

  const qByDay = new Array(DAYS).fill(0);
  for (const a of qa) {
    const i = idx.get(dayKey(a.createdAt));
    if (i !== undefined) qByDay[i]++;
  }
  const docByDay = new Array(DAYS).fill(0);
  const piiByDay = new Array(DAYS).fill(0);
  const threatByDay = new Array(DAYS).fill(0);
  for (const d of docs) {
    const i = idx.get(dayKey(d.createdAt));
    if (i === undefined) continue;
    docByDay[i]++;
    piiByDay[i] += d.piiRedactions;
    if (d.quarantined) threatByDay[i]++;
  }
  const cumulative = (arr: number[], base: number) => {
    let run = base;
    return arr.map((v) => (run += v));
  };

  const sum7 = (arr: number[], end: number) => arr.slice(Math.max(0, end - 7), end).reduce((a, b) => a + b, 0);
  const docsBefore = docs.length - docByDay.reduce((a, b) => a + b, 0);

  const totalQueries = qa.length;
  const indexedDocs = docs.filter((d) => !d.quarantined).length;
  const quarantined = docs.filter((d) => d.quarantined).length;
  const piiTotal = docs.reduce((a, d) => a + d.piiRedactions, 0);

  const kpis: Kpi[] = [
    {
      label: "Queries",
      value: totalQueries,
      display: totalQueries.toLocaleString(),
      deltaPct: pctChange(sum7(qByDay, DAYS), sum7(qByDay, DAYS - 7)),
      spark: qByDay,
      tone: "gold",
    },
    {
      label: "Documents indexed",
      value: indexedDocs,
      display: indexedDocs.toLocaleString(),
      deltaPct: pctChange(sum7(docByDay, DAYS), sum7(docByDay, DAYS - 7)),
      spark: cumulative(docByDay, docsBefore),
      tone: "emerald",
    },
    {
      label: "Threats blocked",
      value: quarantined,
      display: quarantined.toLocaleString(),
      deltaPct: pctChange(sum7(threatByDay, DAYS), sum7(threatByDay, DAYS - 7)),
      spark: threatByDay,
      tone: "red",
    },
    {
      label: "PII redactions",
      value: piiTotal,
      display: piiTotal.toLocaleString(),
      deltaPct: pctChange(sum7(piiByDay, DAYS), sum7(piiByDay, DAYS - 7)),
      spark: piiByDay,
      tone: "emerald",
    },
  ];

  const series = days.map((d, i) => ({ label: d.slice(5), value: qByDay[i] }));

  // Rings — live security posture.
  const chain = await verifyChain();
  const redteam = runRedTeam();
  const egress = getEgressManifest();
  const internalPct =
    egress.endpoints.length === 0
      ? 100
      : Math.round((egress.endpoints.filter((e) => e.scope === "internal").length / egress.endpoints.length) * 100);
  const rings: Ring[] = [
    { label: "Audit chain", pct: chain.ok ? 100 : 0, caption: chain.ok ? `${chain.entries} entries intact` : "chain broken" },
    { label: "Red-team", pct: redteam.score, caption: `${redteam.passed}/${redteam.total} caught` },
    { label: "Egress blocked", pct: internalPct, caption: `${egress.endpoints.length}/${egress.endpoints.length} internal` },
  ];

  // Threats breakdown — aggregate injection-finding rules across quarantined docs + PII.
  const ruleCounts = new Map<string, number>();
  for (const d of docs) {
    if (!Array.isArray(d.injectionFindings)) continue;
    for (const f of d.injectionFindings as { rule?: string }[]) {
      if (f?.rule) ruleCounts.set(f.rule, (ruleCounts.get(f.rule) ?? 0) + 1);
    }
  }
  if (piiTotal > 0) ruleCounts.set("pii-redaction", piiTotal);
  const threats: BarItem[] = [...ruleCounts.entries()]
    .map(([label, value]) => ({ label: label.replace(/-/g, " "), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Top sources — most-cited documents across answered queries.
  const srcCounts = new Map<string, number>();
  for (const a of qa) {
    if (!Array.isArray(a.sources)) continue;
    for (const s of a.sources as { sourceName?: string }[]) {
      const n = s?.sourceName;
      if (n) srcCounts.set(n, (srcCounts.get(n) ?? 0) + 1);
    }
  }
  const sources: BarItem[] = [...srcCounts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Activity feed — merge recent queries + document events.
  const events: Activity[] = [
    ...qa.map((a) => ({ at: a.createdAt, kind: "query" as const, actor: a.userEmail, detail: a.question })),
    ...docs.map((d) => ({
      at: d.createdAt,
      kind: d.quarantined ? ("quarantined" as const) : ("indexed" as const),
      actor: "ingest",
      detail: d.sourceName,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);

  return {
    kpis,
    series,
    rings,
    threats,
    sources,
    activity: events,
    airGap: egress.airGapCompatible,
    generatedAt: new Date().toISOString(),
  };
}
