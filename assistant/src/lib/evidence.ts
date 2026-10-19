import { GEN_MODEL } from "./ollama";
import type { ChainStatus } from "./audit";

export interface AuditRow {
  id: string;
  userEmail: string;
  question: string;
  answer: string;
  sources: unknown;
  model: string;
  collection: string;
  createdAt: Date;
}

// How Vaultic's controls SUPPORT recognised frameworks. Framed as "supported
// by", NOT as a certification or compliance statement.
const CONTROL_MAPPINGS = [
  {
    framework: "ISO/IEC 27001:2022",
    control: "A.8.15 — Logging",
    supportedBy: "Every AI query, answer, sources, user and timestamp are recorded in an append-only log.",
  },
  {
    framework: "EU AI Act (Reg. (EU) 2024/1689)",
    control: "Art. 12 — Record-keeping / automatic logging",
    supportedBy: "Each interaction is automatically logged with a SHA-256 hash chain, making the record tamper-evident.",
  },
  {
    framework: "GDPR (Reg. (EU) 2016/679)",
    control: "Art. 5(1)(c) & 32 — Data minimisation / integrity",
    supportedBy: "PII is detected and redacted at ingest (before storage) and at egress (before an answer leaves the system).",
  },
  {
    framework: "OWASP LLM Top 10 (2025)",
    control: "LLM01 Prompt Injection / LLM08 Vector & Embedding Weaknesses",
    supportedBy: "Documents are screened for injection/poisoning at ingest; high-severity items are quarantined and never indexed.",
  },
  {
    framework: "GDPR Art. 44+ / EU data residency",
    control: "Data localisation / no third-country transfer",
    supportedBy: "Inference, embeddings, retrieval and storage all run locally; no external API is in the answer path (zero egress).",
  },
  {
    framework: "DORA (Reg. (EU) 2022/2554)",
    control: "ICT third-party risk & audit trails",
    supportedBy: "No external ICT AI provider in the answer path; the hash-chained log evidences every interaction for oversight.",
  },
  {
    framework: "NIS2 (Dir. (EU) 2022/2555)",
    control: "Art. 21(2) — logging, monitoring & accountability",
    supportedBy: "AI usage is logged for accountability and incident reconstruction.",
  },
];

export interface SbomSummary {
  format: string; // e.g. "CycloneDX"
  specVersion: string; // e.g. "1.6"
  components: number; // runtime dependency count
}

export function buildEvidencePack(
  rows: AuditRow[],
  generatedAt: string,
  generatedBy: string,
  chain: ChainStatus,
  sbom?: SbomSummary,
) {
  return {
    product: "Vaultic — private AI evidence pack",
    generatedAt,
    generatedBy,
    disclaimer:
      "This pack evidences how Vaultic's controls and local-only architecture SUPPORT the listed frameworks. It is not a certification, audit opinion, or statement of compliance.",
    systemAttestation: {
      zeroDataEgress: true,
      inference: "local (Ollama) — no external API in the answer path",
      retrieval: "on-premises vector store (Qdrant) with local embeddings",
      dataResidency: "all documents, embeddings, answers and logs remain on the operator's own infrastructure",
      piiHandling: "detected + redacted at ingest and egress",
      injectionDefence: "documents screened for prompt-injection/poisoning; high-severity quarantined",
      auditLogIntegrity: chain.ok
        ? `verified — SHA-256 hash chain intact across ${chain.entries} entries`
        : `BROKEN — chain mismatch at entry ${chain.brokenAt}`,
      auditEntries: chain.entries,
    },
    aiBom: {
      generationModel: GEN_MODEL,
      embeddingModel: process.env.EMBED_MODEL ?? "nomic-embed-text",
      vectorStore: "Qdrant (on-prem)",
      runtime: ["Next.js 16", "Node 24", "PostgreSQL 16", "Ollama (open-weight models)"],
      note: "All components run locally on the operator's infrastructure; no external model API is invoked to answer.",
    },
    sbom: sbom
      ? {
          ...sbom,
          generatedAtBuild: true,
          download: "/api/sbom",
          note: `Real ${sbom.format} ${sbom.specVersion} SBOM of ${sbom.components} runtime components, generated at build and downloadable for supply-chain review.`,
        }
      : { available: false, note: "No SBOM was generated for this build." },
    controlMappings: CONTROL_MAPPINGS,
    auditTrail: {
      entries: chain.entries, // full chain length (verified)
      recordsIncluded: rows.length, // records embedded in this pack
      recordsTruncated: chain.entries > rows.length,
      hashChainVerified: chain.ok,
      records: rows.map((r) => ({
        id: r.id,
        at: r.createdAt,
        user: r.userEmail,
        model: r.model,
        collection: r.collection,
        question: r.question,
        answer: r.answer,
        sources: r.sources,
      })),
    },
  };
}
