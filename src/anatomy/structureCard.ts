import type { AnatomyStructure } from "./types";

export function structureToQaFields(
  structure: AnatomyStructure,
  sceneTitle: string,
): { front: string; back: string } {
  const front = structure.label.trim();
  const summary = structure.info?.summary?.trim() ?? "";
  const synonyms =
    structure.info?.alsoKnownAs
      ?.map((s) => s.trim())
      .filter((s) => s.length > 0) ?? [];
  const parts: string[] = [];
  if (summary) parts.push(summary);
  if (synonyms.length > 0) {
    parts.push(`Also known as: ${synonyms.join(", ")}`);
  }
  if (parts.length === 0) {
    parts.push(sceneTitle.trim() || "Anatomy");
  }
  return { front, back: parts.join("\n\n") };
}

export function makeCardsStructureIds(
  selectedId: string | null,
  revealedIds: ReadonlySet<string>,
): string[] {
  const ids = new Set(revealedIds);
  if (selectedId) ids.add(selectedId);
  return [...ids];
}
