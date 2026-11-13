export type GradeableStructure = {
  label: string;
  info?: { alsoKnownAs?: string[] };
};

/** Case-insensitive ASCII normalize: trim + collapse whitespace. */
export function normalizeAnswer(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when input matches the structure label or any alsoKnownAs synonym. */
export function gradeAnswer(
  input: string,
  structure: GradeableStructure,
): boolean {
  const normalized = normalizeAnswer(input);
  if (!normalized) return false;
  if (normalizeAnswer(structure.label) === normalized) return true;
  const synonyms = structure.info?.alsoKnownAs ?? [];
  return synonyms.some((alias) => normalizeAnswer(alias) === normalized);
}
