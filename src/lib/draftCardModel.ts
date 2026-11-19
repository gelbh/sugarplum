import type {
  CardDraftView,
  CardType,
  OcclusionFrontView,
} from "../api/client";
import {
  MCQ_MAX,
  MCQ_MIN,
  correctIndexFor,
  pickCorrect,
  type McqDraft,
} from "../deckHub/mcqDraftEdit";

export type DraftEditorChange = Pick<
  CardDraftView,
  "front" | "back" | "type" | "options"
>;

const TEXT_TYPES: CardType[] = ["qa", "cloze", "image_label", "diagram", "mcq"];

export const TYPE_LABELS: Record<CardType, string> = {
  qa: "Q&A",
  cloze: "Fill in the blank",
  mcq: "Multiple choice",
  image_label: "Image label",
  diagram: "Diagram",
  occlusion: "Occlusion",
};

export function cardFrontPreview(card: CardDraftView): string {
  if (typeof card.front === "string") return card.front;
  if (
    typeof card.front === "object" &&
    card.front !== null &&
    "prompt" in card.front &&
    typeof card.front.prompt === "string" &&
    card.front.prompt.trim()
  ) {
    return card.front.prompt;
  }
  return card.type === "occlusion" ? "Occlusion card" : "Card";
}

export function diySelectableTypes(allowedTypes?: CardType[]): CardType[] {
  if (allowedTypes && allowedTypes.length > 0) {
    return allowedTypes.filter(
      (t) => TEXT_TYPES.includes(t) || t === "occlusion",
    );
  }
  return TEXT_TYPES;
}

/** Resolve Select value when `allowedTypes` is set. Never coerce outside the set to qa. */
export function resolveEditorType(
  cardType: CardType,
  allowedTypes?: CardType[],
): { typeValue: CardType; typeSelectLocked: boolean } {
  const selectable = diySelectableTypes(allowedTypes);
  if (selectable.includes(cardType)) {
    return { typeValue: cardType, typeSelectLocked: false };
  }
  if (allowedTypes && allowedTypes.length > 0) {
    return { typeValue: cardType, typeSelectLocked: true };
  }
  return { typeValue: "qa", typeSelectLocked: false };
}

export function typeSelectModel(
  cardType: CardType,
  allowedTypes?: CardType[],
): { value: CardType; options: CardType[]; locked: boolean } {
  if (cardType === "occlusion" && !(allowedTypes && allowedTypes.length > 0)) {
    return { value: "occlusion", options: ["occlusion"], locked: true };
  }
  const { typeValue, typeSelectLocked } = resolveEditorType(
    cardType,
    allowedTypes,
  );
  return {
    value: typeValue,
    options: typeSelectLocked ? [typeValue] : diySelectableTypes(allowedTypes),
    locked: typeSelectLocked,
  };
}

export function isOcclusionFront(
  front: CardDraftView["front"],
): front is OcclusionFrontView {
  return typeof front === "object" && front !== null && "regions" in front;
}

export function backAnswer(back: CardDraftView["back"]): string {
  if (typeof back === "object" && back !== null && "answer" in back) {
    return back.answer;
  }
  return typeof back === "string" ? back : "";
}

export function starterOcclusionFront(imageKey: string): OcclusionFrontView {
  return {
    image_key: imageKey,
    regions: [],
    mode: "hide_one",
  };
}

export function draftFaceKind(
  card: CardDraftView,
): "mcq" | "occlusion" | "text" {
  if (isOcclusionFront(card.front)) return "occlusion";
  if (card.type === "mcq") return "mcq";
  return "text";
}

export function defaultMcqOptions(card: CardDraftView): string[] {
  if (
    card.options &&
    card.options.length >= MCQ_MIN &&
    card.options.length <= MCQ_MAX
  ) {
    return [...card.options];
  }
  const back = backAnswer(card.back).trim();
  if (back) {
    return [back, "", ""];
  }
  return ["", "", ""];
}

export function mcqDraftFromCard(card: CardDraftView): McqDraft {
  const options = card.options ?? defaultMcqOptions(card);
  return {
    options,
    correctIndex: correctIndexFor(options, backAnswer(card.back)),
  };
}

export function draftForType(
  card: CardDraftView,
  type: CardType,
): DraftEditorChange {
  const frontText = isOcclusionFront(card.front)
    ? (card.front.prompt ?? "")
    : typeof card.front === "string"
      ? card.front
      : "";
  const backText = backAnswer(card.back);
  if (type === "occlusion") {
    const imageKey =
      card.media_r2_keys?.[0] ??
      (isOcclusionFront(card.front) ? card.front.image_key : "");
    return {
      front: starterOcclusionFront(imageKey),
      back: { answer: "" },
      type,
    };
  }
  if (type === "mcq") {
    const options = defaultMcqOptions(card);
    return {
      front: frontText,
      back: pickCorrect(options, backText),
      type,
      options,
    };
  }
  return {
    front: frontText,
    back: backText,
    type,
  };
}
