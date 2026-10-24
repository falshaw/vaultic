import { describe, it, expect } from "vitest";
import { changeProblem, passwordProblem } from "../lib/users";

const admin = { id: "a1", role: "admin" as const, disabled: false };
const user = { id: "u1", role: "user" as const, disabled: false };

describe("passwordProblem", () => {
  it("needs 12 characters and more than one repeated character", () => {
    expect(passwordProblem("short-pass1")).toMatch(/12/);
    expect(passwordProblem("aaaaaaaaaaaaaa")).toMatch(/repeated/);
    expect(passwordProblem("correct-horse-battery")).toBeNull();
  });
});

describe("changeProblem", () => {
  it("never lets an admin lock themselves out", () => {
    expect(changeProblem(admin, "a1", 3, { role: "user" })).toMatch(/your own admin/);
    expect(changeProblem(admin, "a1", 3, { disabled: true })).toMatch(/your own account/);
  });

  it("keeps the last active admin", () => {
    const other = { id: "a2", role: "admin" as const, disabled: false };
    expect(changeProblem(other, "a1", 1, { role: "user" })).toMatch(/at least one active admin/);
    expect(changeProblem(other, "a1", 1, { disabled: true })).toMatch(/at least one active admin/);
    expect(changeProblem(other, "a1", 2, { role: "user" })).toBeNull();
  });

  it("allows ordinary changes to other users", () => {
    expect(changeProblem(user, "a1", 1, { role: "admin" })).toBeNull();
    expect(changeProblem(user, "a1", 1, { disabled: true })).toBeNull();
    // re-enabling a disabled admin is never a problem
    expect(changeProblem({ ...admin, id: "a3", disabled: true }, "a1", 1, { disabled: false })).toBeNull();
  });
});
