import { useState, type Dispatch, type SetStateAction } from "react";
import {
  ApiError,
  listDecks,
  listSubjects,
  moveCard,
  patchCard,
  asRegenType,
  cardHasRegenSource,
  regenCard,
  resetCardSchedule,
  type CardDraftView,
  type Deck,
  type Subject,
} from "../../api/client";
import { cardPatchBody } from "../../draftReview";
import type { DraftEditorChange } from "../../draftReview";

type Args = {
  deckId: string;
  guest: boolean;
  subject: Subject | null;
  cards: CardDraftView[];
  setCards: Dispatch<SetStateAction<CardDraftView[]>>;
  setAcceptedCount: Dispatch<SetStateAction<number>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
};

type MoveConfirmCtx = {
  selectedCardIds: Set<string>;
  showArchived: boolean;
  clearSelection: () => void;
};

export function useDeckHubCardMutations({
  deckId,
  guest,
  subject,
  cards,
  setCards,
  setAcceptedCount,
  setNotice,
}: Args) {
  const [editCard, setEditCard] = useState<CardDraftView | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [cardRegenBusy, setCardRegenBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const editDialogBusy = editBusy || resetBusy || cardRegenBusy;

  const [moveTarget, setMoveTarget] = useState<CardDraftView | null>(null);
  const [moveAsBatch, setMoveAsBatch] = useState(false);
  const [moveSubjects, setMoveSubjects] = useState<Subject[]>([]);
  const [moveDecks, setMoveDecks] = useState<Deck[]>([]);
  const [moveSubjectId, setMoveSubjectId] = useState("");
  const [moveDeckId, setMoveDeckId] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  function openEdit(card: CardDraftView) {
    if (card.status === "archived") return;
    setEditError(null);
    setEditCard({
      ...card,
      options: card.options ? [...card.options] : undefined,
    });
  }

  function onEditChange(next: DraftEditorChange) {
    setEditCard((prev) =>
      prev
        ? {
            ...prev,
            front: next.front,
            back: next.back,
            type: next.type,
            ...(next.options !== undefined ? { options: next.options } : {}),
          }
        : prev,
    );
  }

  async function saveEdit() {
    if (!editCard) return;
    setEditBusy(true);
    setEditError(null);
    try {
      const updated = await patchCard(editCard.id, cardPatchBody(editCard));
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditCard(null);
      setNotice("Card saved");
    } catch (err) {
      setEditError(
        err instanceof ApiError ? err.message : "Could not save card",
      );
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmResetSchedule() {
    if (!editCard) return;
    setResetBusy(true);
    setEditError(null);
    try {
      const updated = await resetCardSchedule(editCard.id);
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditCard(updated);
      setConfirmReset(false);
      setNotice("Schedule reset");
    } catch (err) {
      setEditError(
        err instanceof ApiError ? err.message : "Could not reset schedule",
      );
    } finally {
      setResetBusy(false);
    }
  }

  const moveDeckChoices = moveDecks.filter(
    (d) => d.subject_id === moveSubjectId && d.id !== deckId,
  );

  async function openMove(card: CardDraftView, opts?: { batch?: boolean }) {
    setMoveError(null);
    setMoveAsBatch(Boolean(opts?.batch));
    setMoveTarget(card);
    setMoveBusy(true);
    try {
      const [subjects, decks] = await Promise.all([
        listSubjects(),
        listDecks(),
      ]);
      setMoveSubjects(subjects);
      setMoveDecks(decks);
      const defaultSubjectId =
        subject?.id ??
        decks.find((d) => d.id === deckId)?.subject_id ??
        subjects[0]?.id ??
        "";
      setMoveSubjectId(defaultSubjectId);
      const firstDeck = decks.find(
        (d) => d.subject_id === defaultSubjectId && d.id !== deckId,
      );
      setMoveDeckId(firstDeck?.id ?? "");
    } catch (err) {
      setMoveError(
        err instanceof ApiError ? err.message : "Could not load decks",
      );
    } finally {
      setMoveBusy(false);
    }
  }

  function onMoveSubjectChange(nextSubjectId: string) {
    setMoveSubjectId(nextSubjectId);
    const first = moveDecks.find(
      (d) => d.subject_id === nextSubjectId && d.id !== deckId,
    );
    setMoveDeckId(first?.id ?? "");
  }

  async function openBatchMove(selectedCardIds: Set<string>) {
    if (selectedCardIds.size === 0) return;
    const first = cards.find((c) => selectedCardIds.has(c.id));
    if (!first) return;
    await openMove(first, { batch: true });
  }

  async function confirmMoveCard(ctx: MoveConfirmCtx) {
    if (!moveTarget || !moveDeckId) return;
    setMoveBusy(true);
    setMoveError(null);
    try {
      const batchIds =
        moveAsBatch && ctx.selectedCardIds.size > 0
          ? [...ctx.selectedCardIds]
          : [moveTarget.id];
      for (const id of batchIds) {
        await moveCard(id, moveDeckId);
      }
      const moved = new Set(batchIds);
      setCards((prev) => prev.filter((c) => !moved.has(c.id)));
      if (!ctx.showArchived) {
        setAcceptedCount((n) => Math.max(0, n - batchIds.length));
      }
      if (editCard && moved.has(editCard.id)) {
        setEditCard(null);
      }
      ctx.clearSelection();
      const destTitle =
        moveDecks.find((d) => d.id === moveDeckId)?.title ?? "deck";
      setMoveTarget(null);
      setMoveAsBatch(false);
      setNotice(
        batchIds.length === 1
          ? `Moved card to "${destTitle}"`
          : `Moved ${batchIds.length} cards to "${destTitle}"`,
      );
    } catch (err) {
      setMoveError(
        err instanceof ApiError ? err.message : "Could not move card",
      );
    } finally {
      setMoveBusy(false);
    }
  }

  async function onRegenEditCard() {
    if (!editCard || guest) return;
    const type = asRegenType(editCard.type);
    if (!type) {
      setEditError("Choose Q&A, cloze, or multiple choice before regenerating");
      return;
    }
    if (!cardHasRegenSource(editCard)) {
      setEditError(
        "No source text for this card. Edit manually or regenerate from a job with material.",
      );
      return;
    }
    setCardRegenBusy(true);
    setEditError(null);
    try {
      const updated = await regenCard(editCard.id, { type });
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditCard(updated);
      setNotice("Card regenerated");
    } catch (err) {
      setEditError(
        err instanceof ApiError ? err.message : "Could not regenerate card",
      );
    } finally {
      setCardRegenBusy(false);
    }
  }

  return {
    editCard,
    setEditCard,
    editBusy,
    editError,
    cardRegenBusy,
    editDialogBusy,
    openEdit,
    onEditChange,
    saveEdit,
    onRegenEditCard,
    confirmReset,
    setConfirmReset,
    resetBusy,
    confirmResetSchedule,
    moveTarget,
    setMoveTarget,
    moveAsBatch,
    setMoveAsBatch,
    moveSubjects,
    moveDecks,
    moveSubjectId,
    moveDeckId,
    setMoveDeckId,
    moveBusy,
    moveError,
    moveDeckChoices,
    openMove,
    onMoveSubjectChange,
    openBatchMove,
    confirmMoveCard,
  };
}
