import type { Deck } from "../api/client";

export type TitleDialog =
  | { kind: "subject" }
  | { kind: "deck-create" }
  | { kind: "deck-rename"; deck: Deck }
  | null;

export type CoverTarget = {
  ownerKind: "subject" | "deck";
  ownerId: string;
  title: string;
};
