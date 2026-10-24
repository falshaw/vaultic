// User-management rules, kept free of I/O so they can be tested directly.

export const MIN_PASSWORD_LENGTH = 12;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (/^(.)\1+$/.test(password)) return "Use more than one repeated character.";
  return null;
}

export interface UserChange {
  role?: "admin" | "user";
  disabled?: boolean;
}

/**
 * Why an admin may not make this change, or null when it is allowed.
 * Nobody can lock themselves out, and the last active admin always stays.
 */
export function changeProblem(
  target: { id: string; role: "admin" | "user"; disabled: boolean },
  actorId: string,
  activeAdmins: number,
  change: UserChange,
): string | null {
  const self = target.id === actorId;
  if (self && change.role === "user") return "You cannot remove your own admin role.";
  if (self && change.disabled === true) return "You cannot disable your own account.";
  const losesAdmin =
    target.role === "admin" && !target.disabled && (change.role === "user" || change.disabled === true);
  if (losesAdmin && activeAdmins <= 1) return "Keep at least one active admin.";
  return null;
}
