/**
 * Source name to show after the user picks a file. The field follows the chosen
 * file's name unless the user typed their own name: a name that is empty or still
 * equal to the previously auto-filled file name gets replaced. Without this, a
 * name left over from an earlier upload (e.g. a quarantined one) was silently
 * reused for the next file.
 */
export function nextSourceName(current: string, lastAuto: string | null, file: { name: string } | null): string {
  if (!file) return current === lastAuto ? "" : current;
  const userTyped = current.trim() !== "" && current !== lastAuto;
  return userTyped ? current : file.name;
}
