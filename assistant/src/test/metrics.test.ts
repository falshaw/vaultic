import { describe, expect, it } from "vitest";
import { countRedactions, scopeForViewer, topSources, weekBars } from "../lib/metrics";

describe("weekBars", () => {
  const now = new Date("2026-10-20T12:00:00Z"); // a Tuesday

  it("returns 7 UTC days, oldest first, today last", () => {
    const bars = weekBars([], now);
    expect(bars.map((b) => b.key)).toEqual([
      "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20",
    ]);
    expect(bars.map((b) => b.label)).toEqual(["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"]);
    expect(bars.filter((b) => b.today).map((b) => b.key)).toEqual(["2026-10-20"]);
  });

  it("counts only timestamps inside the window", () => {
    const bars = weekBars(
      [
        new Date("2026-10-20T00:00:01Z"),
        new Date("2026-10-20T23:59:59Z"),
        new Date("2026-10-14T08:00:00Z"),
        new Date("2026-10-13T23:59:59Z"), // day before the window
        new Date("2026-10-21T00:00:00Z"), // tomorrow
      ],
      now,
    );
    expect(bars.map((b) => b.value)).toEqual([1, 0, 0, 0, 0, 0, 2]);
  });
});

describe("countRedactions", () => {
  it("counts every redaction marker the ingest redactor writes", () => {
    expect(countRedactions("Call [REDACTED:PHONE] or [REDACTED:EMAIL]; card [REDACTED:CARD]")).toBe(3);
    expect(countRedactions("IBAN [REDACTED:IBAN], SSN [REDACTED:SSN]")).toBe(2);
  });
  it("ignores text without markers", () => {
    expect(countRedactions("Initial notification within 4 hours [1].")).toBe(0);
    expect(countRedactions("[REDACTED] is not a marker")).toBe(0);
  });
});

describe("topSources", () => {
  it("counts a document once per answer and sorts by citations", () => {
    const entries = [
      { sources: [{ sourceName: "a.md", chunk: 0 }, { sourceName: "a.md", chunk: 1 }, { sourceName: "b.md" }] },
      { sources: [{ sourceName: "b.md" }] },
      { sources: [{ event: "account_lockout" }] },
      { sources: null },
    ];
    expect(topSources(entries)).toEqual([
      { label: "b.md", value: 2 },
      { label: "a.md", value: 1 },
    ]);
  });
});

describe("scopeForViewer", () => {
  const audit = [
    { id: 1, userId: "admin", collection: "vaultic" },
    { id: 2, userId: "u1", collection: "vaultic" },
    { id: 3, userId: "u2", collection: "vaultic" },
    { id: 4, userId: "u1", collection: "security" },
  ];
  const docs = [
    { id: "d1", visibility: "all" },
    { id: "d2", visibility: "admin" },
  ];

  it("gives admins everything", () => {
    const s = scopeForViewer({ userId: "admin", role: "admin" }, audit, docs);
    expect(s.audit).toHaveLength(4);
    expect(s.docs).toHaveLength(2);
  });

  it("limits a user to their own questions and documents visible to all", () => {
    const s = scopeForViewer({ userId: "u1", role: "user" }, audit, docs);
    expect(s.audit.map((a) => a.id)).toEqual([2]);
    expect(s.docs.map((d) => d.id)).toEqual(["d1"]);
  });
});
