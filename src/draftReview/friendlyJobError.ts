const EMPTY_BASE =
  "Generation finished without usable cards from this material.";
const EMPTY_WITH_LO = `${EMPTY_BASE} Learning objectives may not match grounded facts in this material. Try broader objectives, or generate without them.`;

function isEmptyGenerationError(raw: string): boolean {
  if (raw.includes("No schema-valid cards")) return true;
  if (raw.includes("No flashcard drafts could be produced")) return true;
  if (raw.includes("Generation produced no valid draft cards")) return true;
  if (raw.includes("Critique returned no cards")) return true;
  if (raw.includes("Critique returned no schema-valid cards")) return true;
  return false;
}

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
  if (raw.includes("for the given learning objectives")) {
    return EMPTY_WITH_LO;
  }
  if (isEmptyGenerationError(raw)) {
    return EMPTY_BASE;
  }
  return raw;
}
