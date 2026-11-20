import type { OcclusionStudyFace } from "./CardFace";
import type { CardDraftView } from "../api/client";
import { backAnswer, isOcclusionFront } from "../draftReview/draftCardModel";
import {
  occlusionRevealAnswer,
  pickOcclusionRegion,
} from "./pickOcclusionRegion";

export function isMcqCard(card: CardDraftView | null): boolean {
  return card?.type === "mcq";
}

export function studyFrontText(card: CardDraftView): string {
  if (isOcclusionFront(card.front)) {
    return card.front.prompt?.trim() || "";
  }
  return typeof card.front === "string" ? card.front : "";
}

export type OcclusionStudyParts = {
  face: OcclusionStudyFace | undefined;
  answer: string;
};

/**
 * One hide_one pick drives both the mask and the reveal answer (region label,
 * else back.answer).
 */
export function occlusionStudyParts(card: CardDraftView): OcclusionStudyParts {
  const fallback = backAnswer(card.back);
  if (card.type !== "occlusion" || !isOcclusionFront(card.front)) {
    return { face: undefined, answer: fallback };
  }
  const region = pickOcclusionRegion(card.id, card.front.regions);
  if (!region) {
    return { face: undefined, answer: fallback };
  }
  return {
    face: {
      imageKey: card.front.image_key,
      mask: { x: region.x, y: region.y, w: region.w, h: region.h },
    },
    answer: occlusionRevealAnswer(region, fallback),
  };
}
