import type { Dispatch, SetStateAction } from "react";
import {
  ApiError,
  deckStats,
  deleteDeck,
  deleteSubject,
  type Deck,
  type DeckStats,
  type Subject,
} from "../api/client";
import { navigate } from "../shared/nav/navigate";
import { subjectDeleteBlocked } from "./subjectDeleteGuard";

export type SubjectDeleteCtx = {
  subject: Subject | null;
  decks: Deck[];
  deleteTarget: Deck | null;
  syncSubjectFromList: () => Promise<Subject | null>;
  refreshKnowledge: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setConfirmSubjectDelete: Dispatch<SetStateAction<boolean>>;
  setSubjectDeleteBusy: Dispatch<SetStateAction<boolean>>;
  setDeleteTarget: Dispatch<SetStateAction<Deck | null>>;
  setDeleteStats: Dispatch<SetStateAction<DeckStats | null>>;
  setDeleteBusy: Dispatch<SetStateAction<boolean>>;
  setDecks: Dispatch<SetStateAction<Deck[]>>;
};

export function createSubjectDelete(ctx: SubjectDeleteCtx) {
  const {
    subject,
    decks,
    deleteTarget,
    syncSubjectFromList,
    refreshKnowledge,
    setError,
    setConfirmSubjectDelete,
    setSubjectDeleteBusy,
    setDeleteTarget,
    setDeleteStats,
    setDeleteBusy,
    setDecks,
  } = ctx;

  function requestDeleteSubject() {
    if (!subject || subjectDeleteBlocked(subject, decks.length)) return;
    setError(null);
    setConfirmSubjectDelete(true);
  }

  async function confirmDeleteSubject() {
    if (!subject) return;
    setSubjectDeleteBusy(true);
    setError(null);
    try {
      await deleteSubject(subject.id);
      setConfirmSubjectDelete(false);
      navigate("/library");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete subject",
      );
    } finally {
      setSubjectDeleteBusy(false);
    }
  }

  async function openDeleteDeck(deck: Deck) {
    setError(null);
    setDeleteTarget(deck);
    setDeleteStats(null);
    try {
      setDeleteStats(await deckStats(deck.id));
    } catch (err) {
      setDeleteTarget(null);
      setError(
        err instanceof ApiError ? err.message : "Could not load deck stats",
      );
    }
  }

  async function confirmDeleteDeck() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await deleteDeck(deleteTarget.id);
      setDecks((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      await syncSubjectFromList();
      await refreshKnowledge();
      setDeleteTarget(null);
      setDeleteStats(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete deck");
    } finally {
      setDeleteBusy(false);
    }
  }

  return {
    requestDeleteSubject,
    confirmDeleteSubject,
    openDeleteDeck,
    confirmDeleteDeck,
  };
}
