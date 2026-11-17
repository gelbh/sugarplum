export function friendlyJobError(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  if (
    raw.startsWith("R2 object missing:") ||
    raw.includes("not found in storage")
  ) {
    return "Uploaded file not found in storage. Discard and upload again, or try again after storage is reachable.";
  }
  if (raw.includes("No schema-valid cards")) {
    return "Generation finished without usable cards from this material.";
  }
  return raw;
}
