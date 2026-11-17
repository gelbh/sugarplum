import type { Dispatch, SetStateAction } from "react";
import {
  clearCover,
  type Deck,
  type StoredCoverRow,
  type Subject,
} from "../api/client";
import type { CoverTarget } from "./subjectTypes";

export type SubjectCoverCtx = {
  subject: Subject | null;
  guest: boolean;
  coverPicker: CoverTarget | null;
  createDeckHold: boolean;
  finishCreateDeck: (deckId: string) => void;
  setCoverPicker: Dispatch<SetStateAction<CoverTarget | null>>;
  setCovers: Dispatch<SetStateAction<StoredCoverRow[]>>;
};

export function createSubjectCover(ctx: SubjectCoverCtx) {
  const {
    subject,
    guest,
    coverPicker,
    createDeckHold,
    finishCreateDeck,
    setCoverPicker,
    setCovers,
  } = ctx;

  function openCoverPicker() {
    if (!subject || guest) return;
    setCoverPicker({
      ownerKind: "subject",
      ownerId: subject.id,
      title: subject.title,
    });
  }

  function openDeckCoverPicker(deck: Deck) {
    setCoverPicker({
      ownerKind: "deck",
      ownerId: deck.id,
      title: deck.title,
    });
  }

  function onCoverSaved(row: StoredCoverRow) {
    setCovers((prev) => [
      row,
      ...prev.filter(
        (cover) =>
          cover.ownerKind !== row.ownerKind || cover.ownerId !== row.ownerId,
      ),
    ]);
  }

  async function onClearCover() {
    if (!coverPicker) return;
    const { ownerKind, ownerId } = coverPicker;
    await clearCover(ownerKind, ownerId);
    setCovers((prev) =>
      prev.filter(
        (cover) => cover.ownerKind !== ownerKind || cover.ownerId !== ownerId,
      ),
    );
    if (createDeckHold) {
      finishCreateDeck(ownerId);
      return;
    }
    setCoverPicker(null);
  }

  return {
    openCoverPicker,
    openDeckCoverPicker,
    onCoverSaved,
    onClearCover,
  };
}
