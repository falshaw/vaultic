import { describe, expect, it } from "vitest";
import { nextSourceName } from "../lib/source-name";

describe("nextSourceName", () => {
  it("fills an empty name from the file", () => {
    expect(nextSourceName("", null, { name: "a.md" })).toBe("a.md");
  });
  it("follows a new file when the name was auto-filled from the previous one", () => {
    // regression: after a quarantined upload, the next file kept the old file's name
    expect(nextSourceName("vendor-faq-upload.txt", "vendor-faq-upload.txt", { name: "Board-Note.md" })).toBe("Board-Note.md");
  });
  it("keeps a name the user typed", () => {
    expect(nextSourceName("AML policy v3", "a.md", { name: "b.md" })).toBe("AML policy v3");
  });
  it("clears an auto-filled name when the file is removed", () => {
    expect(nextSourceName("a.md", "a.md", null)).toBe("");
    expect(nextSourceName("typed", "a.md", null)).toBe("typed");
  });
});
