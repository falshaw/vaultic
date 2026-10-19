import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appendAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Loads a realistic DEMO dataset (documents + backdated audit log over 14 days)
// so the Overview dashboard renders with live, on-box data. Admin-only and
// idempotent — only runs when the audit log is near-empty. Backdated audit rows
// are appended in chronological order so the SHA-256 hash chain stays valid.

const DOCS = [
  { name: "AML-Policy-2026.pdf", pii: 0, q: false, day: 13 },
  { name: "KYC-Procedures.docx", pii: 0, q: false, day: 13 },
  { name: "Data-Retention-Policy.pdf", pii: 0, q: false, day: 12 },
  { name: "Sanctions-Screening-SOP.pdf", pii: 2, q: false, day: 11 },
  { name: "Incident-Response-Plan.md", pii: 0, q: false, day: 10 },
  { name: "Vendor-Risk-Assessment.pdf", pii: 5, q: false, day: 8 },
  { name: "GDPR-DPA-Template.pdf", pii: 3, q: false, day: 6 },
  { name: "DORA-ICT-Risk-Management-Policy.pdf", pii: 0, q: false, day: 9 },
  { name: "DORA-ICT-Incident-Reporting-Procedure.pdf", pii: 0, q: false, day: 5 },
  { name: "ICT-Third-Party-Register.xlsx", pii: 1, q: false, day: 2 },
  { name: "Board-Minutes-Q1.pdf", pii: 12, q: false, day: 4 },
  { name: "phishing-email.eml", pii: 1, q: true, day: 7, findings: [
    { rule: "instruction-override", severity: "high" }, { rule: "data-exfiltration", severity: "high" },
  ] },
  { name: "leaked-credentials.txt", pii: 4, q: true, day: 3, findings: [
    { rule: "system-prompt-exfiltration", severity: "high" }, { rule: "data-exfiltration", severity: "medium" },
  ] },
];

const QA: { q: string; a: string; src: string[] }[] = [
  { q: "What is the customer due diligence requirement before onboarding?", a: "Customer due diligence must be completed before onboarding any client, including identity verification and beneficial-ownership checks [1].", src: ["AML-Policy-2026.pdf", "KYC-Procedures.docx"] },
  { q: "What is the EUR transaction reporting threshold?", a: "Any transaction at or above EUR 10,000 must be reported to the MLRO within 24 hours [1].", src: ["AML-Policy-2026.pdf"] },
  { q: "Who is the designated MLRO?", a: "The designated Money Laundering Reporting Officer is the Head of Compliance [1].", src: ["AML-Policy-2026.pdf"] },
  { q: "How long must client records be retained?", a: "Client records must be retained for 7 years following the end of the business relationship [1].", src: ["Data-Retention-Policy.pdf"] },
  { q: "What triggers enhanced due diligence?", a: "Enhanced due diligence is triggered for PEPs, high-risk jurisdictions, and unusual transaction patterns [1].", src: ["KYC-Procedures.docx", "AML-Policy-2026.pdf"] },
  { q: "Which sanctions lists must be screened?", a: "Screening must cover EU consolidated, OFAC SDN, and UN Security Council sanctions lists [1].", src: ["Sanctions-Screening-SOP.pdf"] },
  { q: "What is the incident-response escalation path?", a: "Incidents escalate from on-call analyst to the Incident Manager and, for severity-1, to the CISO within 30 minutes [1].", src: ["Incident-Response-Plan.md"] },
  { q: "What are the data-subject rights under the DPA?", a: "Data subjects have rights of access, rectification, erasure, restriction, portability, and objection [1].", src: ["GDPR-DPA-Template.pdf"] },
  { q: "How are vendors risk-tiered?", a: "Vendors are tiered critical/high/medium/low based on data access and operational dependency [1].", src: ["Vendor-Risk-Assessment.pdf"] },
  { q: "What is the retention period for transaction monitoring alerts?", a: "Transaction-monitoring alerts and their dispositions are retained for 5 years [1].", src: ["Data-Retention-Policy.pdf", "AML-Policy-2026.pdf"] },
  { q: "What are the recovery objectives for critical functions under our DORA policy?", a: "For critical or important functions the Firm sets a Recovery Time Objective of no more than 4 hours and a Recovery Point Objective of no more than 15 minutes [1].", src: ["DORA-ICT-Risk-Management-Policy.pdf"] },
  { q: "How often must the Register of Information be updated?", a: "The Register of Information on ICT third-party arrangements must be updated at least annually and made available to the competent authority on request [1].", src: ["DORA-ICT-Risk-Management-Policy.pdf"] },
  { q: "Within what timeframe must a major ICT incident be reported?", a: "A major ICT-related incident must be notified to the competent authority within 4 hours of classification as major and no later than 24 hours after detection, followed by an intermediate report within 72 hours and a final report within one month [1].", src: ["DORA-ICT-Incident-Reporting-Procedure.pdf"] },
  { q: "What makes an ICT incident 'major'?", a: "An incident is treated as major where more than 10% of active clients are affected, a critical service is unavailable for more than 2 hours, there is a confirmed loss of data integrity or confidentiality, or it has been escalated to the management body [1].", src: ["DORA-ICT-Incident-Reporting-Procedure.pdf"] },
  { q: "How often is threat-led penetration testing required?", a: "Where the Firm is designated significant, threat-led penetration testing (TLPT) is performed at least every three years by an independent tester [1].", src: ["DORA-ICT-Risk-Management-Policy.pdf"] },
];

// Rising 14-day query trend (index 0 = 13 days ago … 13 = today).
const PER_DAY = [1, 2, 2, 3, 3, 4, 3, 5, 4, 6, 5, 7, 6, 8];

function backdate(daysAgo: number, hour: number, min: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, min, 0, 0);
  return d;
}

export async function POST() {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "admin only" }, { status: 403 });

  const existing = await prisma.auditLog.count();
  if (existing > 5) return Response.json({ ok: false, skipped: true, reason: `audit log already has ${existing} entries` });

  // Wipe any stray rows so the seed is clean + the chain starts fresh.
  await prisma.auditLog.deleteMany({});
  await prisma.document.deleteMany({});

  // Documents (backdated).
  for (const doc of DOCS) {
    await prisma.document.create({
      data: {
        collection: "vaultic",
        sourceName: doc.name,
        chunks: doc.q ? 0 : 1 + (doc.pii % 3),
        quarantined: doc.q,
        piiRedactions: doc.pii,
        injectionFindings: doc.findings ? (doc.findings as unknown as Prisma.InputJsonValue) : undefined,
        createdAt: backdate(doc.day, 9, 15),
      },
    });
  }

  // Audit rows over 14 days (chronological → valid hash chain).
  let n = 0;
  for (let day = 13; day >= 0; day--) {
    const count = PER_DAY[13 - day];
    for (let k = 0; k < count; k++) {
      const item = QA[n % QA.length];
      const sources = item.src.map((s, i) => ({ sourceName: s, chunk: i, score: 0.74 - i * 0.08, snippet: `${s} — relevant passage…` }));
      await appendAudit({
        userId: session.userId,
        userEmail: session.email,
        question: item.q,
        answer: item.a,
        sources,
        model: "qwen2.5:7b",
        collection: "vaultic",
        at: backdate(day, 9 + (k % 8), (k * 13) % 60),
      });
      n++;
    }
  }

  return Response.json({ ok: true, documents: DOCS.length, auditEntries: n });
}
