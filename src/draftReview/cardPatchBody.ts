import {
  type CardDraftView,
  type CardType,
  patchCard,
} from "../api/client";

export function cardPatchBody(
  card: CardDraftView,
): Parameters<typeof patchCard>[1] {
  const type = card.type as CardType;
  const body: Parameters<typeof patchCard>[1] = {
    front: card.front,
    back: card.back,
    type,
  };
  if (type === "mcq" && card.options) body.options = card.options;
  return body;
}
