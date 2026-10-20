import { describe, it, expect } from "vitest";
import { createStreamRedactor, redactPii, totalPii } from "../lib/pii";

// All values below are fictitious test data.
const EMAIL = "jane.doe@example.com";
const IBAN_SPACED = "DE89 3704 0044 0532 0130 00";
const IBAN_PLAIN = "GB82WEST12345698765432";
const CARD_VALID = "4111 1111 1111 1111"; // Luhn-valid test PAN
const CARD_INVALID = "4111 1111 1111 1112"; // fails Luhn

describe("redactPii", () => {
  it("masks an email address", () => {
    const r = redactPii(`Contact ${EMAIL} for access.`);
    expect(r.text).toBe("Contact [REDACTED:EMAIL] for access.");
    expect(r.hits).toEqual([{ type: "email", count: 1 }]);
  });

  it("masks IBANs in spaced and contiguous form", () => {
    const r = redactPii(`Pay to ${IBAN_SPACED} or ${IBAN_PLAIN}.`);
    expect(r.text).toBe("Pay to [REDACTED:IBAN] or [REDACTED:IBAN].");
    expect(totalPii(r.hits)).toBe(2);
  });

  it("masks only Luhn-valid card numbers", () => {
    const r = redactPii(`Card ${CARD_VALID}, ref ${CARD_INVALID}`);
    expect(r.text).toBe(`Card [REDACTED:CARD], ref ${CARD_INVALID}`);
  });

  it("masks US SSNs and international / area-code phone numbers", () => {
    const r = redactPii("SSN 123-45-6789, call +49 30 1234567 or (030) 1234567.");
    expect(r.text).toBe(
      "SSN [REDACTED:SSN], call [REDACTED:PHONE] or [REDACTED:PHONE].",
    );
  });

  it("leaves ordinary numbers, dates and section references alone", () => {
    const text = "See section 12 34 56 of policy v2.3.1, effective 2026-01-15, 4 hours RTO.";
    const r = redactPii(text);
    expect(r.text).toBe(text);
    expect(r.hits).toEqual([]);
  });

  it("redacts every PII class in a mixed document and counts each", () => {
    const doc = [
      "Incident contact: Jane Doe <" + EMAIL + ">",
      "Refund account: " + IBAN_SPACED,
      "Card on file: " + CARD_VALID,
    ].join("\n");
    const r = redactPii(doc);
    expect(r.text).not.toContain(EMAIL);
    expect(r.text).not.toContain("3704");
    expect(r.text).not.toContain("1111");
    expect(r.text).toContain("Jane Doe"); // names are not covered (documented)
    expect(totalPii(r.hits)).toBe(3);
  });
});

describe("createStreamRedactor", () => {
  function stream(deltas: string[]) {
    const red = createStreamRedactor();
    const emitted = deltas.map((d) => red.push(d));
    const end = red.flush();
    return { emitted, end, joined: emitted.join("") + end.delta };
  }

  it("never emits a partial email split across deltas", () => {
    const { emitted, end, joined } = stream([
      "Write to jane.d",
      "oe@exam",
      "ple.com for help. ",
      "Thanks.",
    ]);
    for (const piece of emitted) {
      expect(piece).not.toMatch(/jane|exam|ple\.com/);
    }
    expect(joined).toBe("Write to [REDACTED:EMAIL] for help. Thanks.");
    expect(end.full).toBe(joined);
    expect(end.piiRedacted).toBe(1);
  });

  it("holds text back until a safe boundary, then releases it redacted", () => {
    const red = createStreamRedactor();
    expect(red.push("The IBAN is DE89 3704")).toBe("");
    expect(red.push(" 0044 0532 0130 00.\n")).toBe("The IBAN is [REDACTED:IBAN].\n");
    expect(red.flush().delta).toBe("");
  });

  it("matches redactPii on the full text", () => {
    const text = `Card ${CARD_VALID}. Email ${EMAIL}. Done.`;
    const deltas = text.match(/.{1,5}/gs) ?? [];
    expect(stream(deltas).joined).toBe(redactPii(text).text);
  });
});
