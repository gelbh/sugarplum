import type { CardType } from "../api/client";

const GUEST_HUB_DIY_TYPES: CardType[] = ["qa", "cloze", "mcq"];
const ACCOUNT_IMAGE_DIY_TYPES: CardType[] = ["occlusion", "image_label"];

export function hubDiyTypes(guest: boolean): CardType[] {
  if (guest) return GUEST_HUB_DIY_TYPES;
  return [...GUEST_HUB_DIY_TYPES, ...ACCOUNT_IMAGE_DIY_TYPES];
}
