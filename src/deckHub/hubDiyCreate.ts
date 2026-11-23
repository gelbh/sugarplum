import type { CardDraftView, CardType, HubCreateCardBody } from "../api/client";
import { hasSingleClozeBlank } from "../study";
import { backAnswer, isOcclusionFront } from "../draftReview";
export { hubDiyTypes } from "./hubDiyTypes";

/** Unique material keys already used on this deck (from cards). */
export function collectDeckImageKeys(cards: CardDraftView[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  const add = (key: string | undefined) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };
  for (const card of cards) {
    for (const key of card.media_r2_keys ?? []) add(key);
    if (isOcclusionFront(card.front)) add(card.front.image_key);
  }
  return keys;
}

export type HubCreateValidation =
  { ok: true; body: HubCreateCardBody } | { ok: false; error: string };

export function validateHubCreateCard(
  card: CardDraftView,
): HubCreateValidation {
  const type = card.type as CardType;

  if (type === "occlusion") {
    if (!isOcclusionFront(card.front)) {
      return { ok: false, error: "Add at least one region on the image" };
    }
    const front = card.front;
    if (!front.image_key.trim()) {
      return { ok: false, error: "Choose or upload an image" };
    }
    if (front.regions.length < 1) {
      return { ok: false, error: "Add at least one region" };
    }
    const backObj =
      typeof card.back === "object" &&
      card.back !== null &&
      "answer" in card.back
        ? card.back
        : {
            answer:
              front.regions[0]?.label.trim() ||
              front.regions[0]?.id ||
              "region",
          };
    return {
      ok: true,
      body: { type: "occlusion", front, back: backObj },
    };
  }

  if (type === "image_label") {
    const mediaKey = card.media_r2_keys?.[0]?.trim();
    if (!mediaKey) {
      return { ok: false, error: "Choose or upload an image" };
    }
    const front = typeof card.front === "string" ? card.front.trim() : "";
    if (!front) {
      return { ok: false, error: "Front is required" };
    }
    const back =
      typeof card.back === "string"
        ? card.back.trim()
        : backAnswer(card.back).trim();
    if (!back) {
      return { ok: false, error: "Back is required" };
    }
    return {
      ok: true,
      body: {
        type: "image_label",
        front,
        back,
        media_r2_keys: [mediaKey],
      },
    };
  }

  if (type !== "qa" && type !== "cloze" && type !== "mcq") {
    return { ok: false, error: "Choose a supported card type" };
  }

  const front = typeof card.front === "string" ? card.front.trim() : "";
  if (!front) {
    return { ok: false, error: "Front is required" };
  }
  if (type === "cloze" && !hasSingleClozeBlank(front)) {
    return { ok: false, error: "Add at least one blank in the sentence" };
  }
  const backRaw =
    typeof card.back === "string" ? card.back : backAnswer(card.back);
  const back = type === "cloze" ? backRaw.trim() : backRaw.trim();
  let options: string[] | undefined;
  if (type === "mcq") {
    options = (card.options ?? []).map((o) => o.trim()).filter(Boolean);
  } else if (type === "qa" && !back) {
    return { ok: false, error: "Back is required" };
  }

  return {
    ok: true,
    body: {
      type,
      front,
      back,
      ...(options ? { options } : {}),
    },
  };
}
