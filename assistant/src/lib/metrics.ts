import { prisma } from "./prisma";
import { verifyChain, type ChainStatus } from "./audit";
import { runRedTeam } from "./redteam";
import { getEgressManifest } from "./egress";

// Every Overview number is computed from rows in Postgres (audit log + documents)
// or from the live checks (chain verification, red-team self-test, egress
// manifest). A fresh install shows zeros and empty states, not sample data.

const WEEK = 7;

export interface DayBar {
  key: string; // YYYY-MM-DD (UTC)
  label: string; // Mon, Tue, ...
  value: number;
  today: boolean;
}
export interface BarItem {
  label: string;
  value: number;
}
export type ActivityKind = "query" | "indexed" | "quarantined" | "security";
export interface Activity {
  at: Date;
  kind: ActivityKind;
  title: string;
  detail: string;
}
export interface Dashboard {
  week: DayBar[];
  weekTotal: number;
  queries: number;
  indexed: number;
  quarantined: number;
  piiRedactions: number;
  chain: ChainStatus;
  redteam: { passed: number; total: number };
  egress: { internal: number; total: number; airGap: boolean };
  sources: BarItem[];
  activity: Activity[];
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Count of timestamps per UTC day for the last 7 days, oldest first, today last. */
export function weekBars(dates: Date[], now = new Date()): DayBar[] {
  const days: DayBar[] = [];
  for (let i = WEEK - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    days.push({ key: dayKey(d), label: WEEKDAY[d.getUTCDay()], value: 0, today: i === 0 });
  }
  const idx = new Map(days.map((d, i) => [d.key, i]));
  for (const t of dates) {
    const i = idx.get(dayKey(t));
    if (i !== undefined) days[i].value++;
  }
  return days;
}

/** Number of `[REDACTED:...]` markers the ingest redactor left in a text. */
export function countRedactions(text: string): number {
  return (text.match(/\[REDACTED:[A-Z-]+\]/g) ?? []).length;
}

/** Most-cited source names across audit entries, highest first. */
export function topSources(entries: { sources: unknown }[], limit = 5): BarItem[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (!Array.isArray(e.sources)) continue;
    // Count each document once per answer, even when several of its chunks were cited.
    const names = new Set<string>();
    for (const s of e.sources as { sourceName?: unknown }[]) {
      if (s && typeof s.sourceName === "string") names.add(s.sourceName);
    }
    for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export interface Viewer {
  userId: string;
  role: "admin" | "user";
}

/**
 * What a viewer may see on the Overview. Admins see everything. A non-admin sees
 * only their own questions and only documents marked visible to all users, so
 * admin-only document names, other users' questions and security events (which
 * carry the targeted email) never reach them.
 */
export function scopeForViewer<
  A extends { userId: string | null; collection: string },
  D extends { visibility: string },
>(viewer: Viewer, audit: A[], docs: D[]): { audit: A[]; docs: D[] } {
  if (viewer.role === "admin") return { audit, docs };
  return {
    audit: audit.filter((a) => a.collection !== "security" && a.userId === viewer.userId),
    docs: docs.filter((d) => d.visibility === "all"),
  };
}

export async function getDashboard(viewer: Viewer): Promise<Dashboard> {
  const [allAudit, allDocs, chain] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.document.findMany({ orderBy: { createdAt: "asc" } }),
    verifyChain(),
  ]);
  const { audit, docs } = scopeForViewer(viewer, allAudit, allDocs);

  // Security events (login lockouts) share the tamper-evident chain but are not
  // questions, so they stay out of the query counts.
  const qa = audit.filter((a) => a.collection !== "security");
  const week = weekBars(qa.map((a) => a.createdAt));

  const redteam = runRedTeam();
  const egress = getEgressManifest();

  const activity: Activity[] = [
    ...audit.map((a): Activity => {
      if (a.collection === "security") {
        return { at: a.createdAt, kind: "security", title: a.question.replace(/^\[security\]\s*/, ""), detail: a.userEmail };
      }
      const n = Array.isArray(a.sources) ? a.sources.length : 0;
      return {
        at: a.createdAt,
        kind: "query",
        title: a.question,
        detail: `${a.userEmail} · ${n} source${n === 1 ? "" : "s"} cited`,
      };
    }),
    ...docs.map((d): Activity => {
      if (d.quarantined) {
        const rules = Array.isArray(d.injectionFindings)
          ? [...new Set((d.injectionFindings as { rule?: string }[]).map((f) => f?.rule).filter(Boolean))]
          : [];
        return {
          at: d.createdAt,
          kind: "quarantined",
          title: d.sourceName,
          detail: rules.length ? `ingest · matched ${rules.join(", ")}` : "ingest · quarantined",
        };
      }
      return {
        at: d.createdAt,
        kind: "indexed",
        title: d.sourceName,
        detail: `ingest · ${d.chunks} chunk${d.chunks === 1 ? "" : "s"} · ${d.piiRedactions} PII redacted`,
      };
    }),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);

  return {
    week,
    weekTotal: week.reduce((s, d) => s + d.value, 0),
    queries: qa.length,
    indexed: docs.filter((d) => !d.quarantined).length,
    quarantined: docs.filter((d) => d.quarantined).length,
    piiRedactions: docs.reduce((s, d) => s + d.piiRedactions, 0),
    chain,
    redteam: { passed: redteam.passed, total: redteam.total },
    egress: {
      internal: egress.endpoints.length - egress.externalCount,
      total: egress.endpoints.length,
      airGap: egress.airGapCompatible,
    },
    sources: topSources(qa),
    activity,
  };
}
