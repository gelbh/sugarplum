import type { CardDraftView } from "../../api/client";
import { backAnswer, isOcclusionFront } from "../../draftReview";
import {
  occlusionRevealAnswer,
  pickOcclusionRegion,
} from "../../study";
import type { OcclusionMaskBox } from "./occlusionLayout";

export function previewFront(card: CardDraftView): string {
  if (isOcclusionFront(card.front)) {
    return card.front.prompt?.trim() ?? "";
  }
  return typeof card.front === "string" ? card.front : "";
}

export function editorFaceMaxWidthMd(type: CardDraftView["type"]): number {
  return type === "mcq" || type === "occlusion" ? 280 : 240;
}

export function editorFaceMaxHeightMd(
  type: CardDraftView["type"],
): number | string {
  return type === "mcq"
    ? 360
    : type === "occlusion"
      ? "min(420px, 70vh)"
      : 300;
}

export function previewParts(card: CardDraftView): {
  front: string;
  back: string;
  occlusion:
    | {
        imageKey: string;
        masks: OcclusionMaskBox[];
        studyMask: OcclusionMaskBox | undefined;
      }
    | undefined;
  imageKey: string | undefined;
} {
  const fallback = backAnswer(card.back);
  if (card.type === "occlusion" && isOcclusionFront(card.front)) {
    const region = pickOcclusionRegion(card.id, card.front.regions);
    const imageKey = card.front.image_key.trim() || undefined;
    if (!imageKey) {
      return {
        front: previewFront(card),
        back: fallback,
        occlusion: undefined,
        imageKey,
      };
    }
    const masks = card.front.regions.map((r) => ({
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
    }));
    return {
      front: previewFront(card),
      back: occlusionRevealAnswer(region, fallback),
      occlusion: {
        imageKey,
        masks,
        studyMask: region
          ? { x: region.x, y: region.y, w: region.w, h: region.h }
          : masks[0],
      },
      imageKey,
    };
  }
  return {
    front: previewFront(card),
    back: fallback,
    occlusion: undefined,
    imageKey: card.media_r2_keys?.[0],
  };
}
