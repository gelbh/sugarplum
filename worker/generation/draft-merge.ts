import type { CardDraft } from "./schema";
import { isNearDuplicateFront } from "./study-windows";

function normalizeFront(front: string): string {
  return front.trim().toLowerCase();
}

export function draftDedupeKey(draft: CardDraft): string {
  if (draft.type === "occlusion") {
    return `occlusion:${draft.front.image_key}:${draft.front.regions
      .map((r) => r.id)
      .join(",")}`;
  }
  return normalizeFront(draft.front);
}

/** Stamp material R2 key onto occlusion fronts (LLM must not invent storage keys). */
export function bindOcclusionImageKey(
  drafts: CardDraft[],
  imageKey: string,
): CardDraft[] {
  return drafts.map((draft) => {
    if (draft.type !== "occlusion") return draft;
    return {
      ...draft,
      front: { ...draft.front, image_key: imageKey },
      media_keys: [imageKey],
    };
  });
}

/** Merge rules then LLM drafts; drop exact and close-paraphrase fronts. */
export function mergeAndDedupeDrafts(
  rulesDrafts: CardDraft[],
  llmDrafts: CardDraft[],
): CardDraft[] {
  const seen = new Set<string>();
  const stringFronts: string[] = [];
  const out: CardDraft[] = [];
  for (const draft of [...rulesDrafts, ...llmDrafts]) {
    const key = draftDedupeKey(draft);
    if (seen.has(key)) continue;
    if (
      typeof draft.front === "string" &&
      isNearDuplicateFront(draft.front, stringFronts)
    ) {
      continue;
    }
    seen.add(key);
    if (typeof draft.front === "string") stringFronts.push(draft.front);
    out.push(draft);
  }
  return out;
}
