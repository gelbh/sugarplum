import type { CardDraftView, MaterialListItem } from "../api/client";
import { cardFrontPreview } from "../draftReview";

export function normalizeWorkshopQuery(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim();
}

export function workshopCardTypeLabel(type: CardDraftView["type"]): string {
  if (type === "cloze") return "Cloze";
  if (type === "mcq") return "MCQ";
  if (type === "occlusion") return "Occlusion";
  if (type === "image_label") return "Image label";
  if (type === "diagram") return "Diagram";
  return "Q&A";
}

export function workshopMaterialKindLabel(kind: string): string {
  if (kind === "pdf") return "PDF";
  if (kind === "pptx") return "PPTX";
  if (kind === "image") return "Image";
  if (kind === "text" || kind === "paste") return "Text";
  if (kind === "topic") return "Topic";
  return kind;
}

export function workshopMaterialTitle(material: MaterialListItem): string {
  return (
    material.filename?.trim() ||
    `${workshopMaterialKindLabel(material.kind)} material`
  );
}

export function cardMatchesWorkshopQuery(
  card: CardDraftView,
  q: string,
): boolean {
  const needle = normalizeWorkshopQuery(q);
  if (needle === "") return true;
  const hay = normalizeWorkshopQuery(
    `${cardFrontPreview(card)} ${workshopCardTypeLabel(card.type)}`,
  );
  return hay.includes(needle);
}

export function materialMatchesWorkshopQuery(
  material: MaterialListItem,
  q: string,
): boolean {
  const needle = normalizeWorkshopQuery(q);
  if (needle === "") return true;
  const hay = normalizeWorkshopQuery(
    `${workshopMaterialTitle(material)} ${workshopMaterialKindLabel(material.kind)}`,
  );
  return hay.includes(needle);
}

export function pruneIdsToVisible(
  selected: Set<string>,
  visibleIds: Iterable<string>,
): Set<string> {
  if (selected.size === 0) return selected;
  const visible = visibleIds instanceof Set ? visibleIds : new Set(visibleIds);
  let changed = false;
  const next = new Set<string>();
  for (const id of selected) {
    if (visible.has(id)) next.add(id);
    else changed = true;
  }
  return changed ? next : selected;
}
