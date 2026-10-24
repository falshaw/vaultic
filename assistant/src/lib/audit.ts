import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Tamper-evident audit log: each entry's hash chains over the previous entry's
// hash + this entry's content. Altering any historical row breaks the chain,
// which verifyChain() detects. (Single-writer assumption for v0 — a high-
// concurrency deployment would serialise appends via a DB sequence/transaction.)

const GENESIS = "0".repeat(64);
// Fixed Postgres advisory-lock key serialising appends to the single audit chain.
const AUDIT_CHAIN_LOCK = 748210;

// Deterministic JSON: object keys sorted recursively, `undefined` dropped (as
// JSON.stringify already does). The audit hash is taken over this canonical form
// so it stays STABLE across a round-trip through Postgres `jsonb`, which does NOT
// preserve object key order. Hashing raw JSON.stringify (insertion order) at
// append but re-hashing the reordered jsonb on read produced a different digest
// and a FALSE "broken chain". (createdAt is ms-precision both ways, so it's safe.)
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

interface ChainFields {
  userEmail: string;
  question: string;
  answer: string;
  model: string;
  collection: string;
  createdAt: Date;
  sources: unknown;
}

export function entryHash(prevHash: string, f: ChainFields): string {
  const payload = stableStringify({
    prevHash,
    userEmail: f.userEmail,
    question: f.question,
    answer: f.answer,
    model: f.model,
    collection: f.collection,
    createdAt: f.createdAt.toISOString(),
    sources: f.sources,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export async function appendAudit(data: {
  userId?: string | null;
  userEmail: string;
  question: string;
  answer: string;
  sources: unknown;
  model: string;
  collection: string;
  at?: Date; // override timestamp (demo seeding) — keeps the chain valid for backdated rows
}) {
  // Serialize ALL appends on one Postgres advisory lock so concurrent writers
  // (e.g. a chat completion + a login-lockout event) cannot read the same chain
  // tip and fork it — which would make verifyChain falsely report BROKEN.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK}::bigint)`;
    // id tiebreak: legacy/demo-seeded rows (backdated `at:`) can tie on
    // createdAt, which would make the tip pick non-deterministic.
    const prev = await tx.auditLog.findFirst({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const prevHash = prev?.entryHash ?? GENESIS;
    // Keep createdAt strictly increasing with append order so the chain's
    // createdAt-ordering matches its hash linkage (a same-instant tie could
    // otherwise reorder the chain and read as broken).
    let createdAt = data.at ?? new Date();
    if (prev && createdAt.getTime() <= prev.createdAt.getTime()) {
      createdAt = new Date(prev.createdAt.getTime() + 1);
    }
    const hash = entryHash(prevHash, { ...data, createdAt });
    return tx.auditLog.create({
      data: {
        userId: data.userId ?? null,
        userEmail: data.userEmail,
        question: data.question,
        answer: data.answer,
        sources: data.sources as Prisma.InputJsonValue,
        model: data.model,
        collection: data.collection,
        createdAt,
        prevHash,
        entryHash: hash,
      },
    });
  });
}

export interface ChainStatus {
  ok: boolean;
  entries: number;
  brokenAt?: string;
}

// Verify the whole chain WITHOUT loading every row into memory at once — read in
// batches (offset pagination preserves the exact createdAt order, so the result
// is identical to a load-all) and carry prevHash across batches. Keeps memory
// O(BATCH) for an audit log that grows without bound on a long-lived appliance.
export async function verifyChain(): Promise<ChainStatus> {
  const BATCH = 1000;
  let prevHash = GENESIS;
  let entries = 0;
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      // id tiebreak: same-instant rows would otherwise paginate in undefined
      // order and falsely report the chain BROKEN.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: entries,
      take: BATCH,
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      const expected = entryHash(prevHash, {
        userEmail: r.userEmail,
        question: r.question,
        answer: r.answer,
        model: r.model,
        collection: r.collection,
        createdAt: r.createdAt,
        sources: r.sources,
      });
      if (r.prevHash !== prevHash || r.entryHash !== expected) {
        return { ok: false, entries: entries + 1, brokenAt: r.id };
      }
      prevHash = r.entryHash;
      entries++;
    }
    if (rows.length < BATCH) break;
  }
  return { ok: true, entries };
}

/** Audit collections that are not questions: kept out of query counts and the Q&A view. */
export const EVENT_COLLECTIONS = ["security", "admin"];

/**
 * Record an admin action (upload, quarantine, delete, visibility, user change)
 * in the same tamper-evident chain. Never fails the action it records.
 */
export async function auditAdminEvent(
  actor: { userId: string; email: string },
  title: string,
  detail: string,
  data: Record<string, unknown>,
): Promise<void> {
  await appendAudit({
    userId: actor.userId,
    userEmail: actor.email,
    question: `[admin] ${title}`,
    answer: detail,
    sources: [data],
    model: "—",
    collection: "admin",
  }).catch(() => {});
}
