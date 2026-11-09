import { useState, type Dispatch, type SetStateAction } from "react";
import {
  ApiError,
  archiveCard,
  restoreCard,
  type CardDraftView,
} from "../api/client";

type Args = {
  setCards: Dispatch<SetStateAction<CardDraftView[]>>;
  setAcceptedCount: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  editCard: CardDraftView | null;
  setEditCard: Dispatch<SetStateAction<CardDraftView | null>>;
};

export function useCardsWorkshop({
  setCards,
  setAcceptedCount,
  setError,
  setNotice,
  editCard,
  setEditCard,
}: Args) {
  const [showArchived, setShowArchived] = useState(false);
  const [archiveBusyId, setArchiveBusyId] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [batchBusy, setBatchBusy] = useState(false);

  function clearSelection() {
    setSelectedCardIds(new Set());
  }

  function onToggleSelect(id: string) {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSelectAll(cards: CardDraftView[]) {
    setSelectedCardIds(new Set(cards.map((c) => c.id)));
  }

  async function onArchiveCard(card: CardDraftView) {
    setArchiveBusyId(card.id);
    setError(null);
    try {
      await archiveCard(card.id);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      setAcceptedCount((n) => Math.max(0, n - 1));
      if (editCard?.id === card.id) {
        setEditCard(null);
      }
      setNotice("Card archived");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not archive card",
      );
    } finally {
      setArchiveBusyId(null);
    }
  }

  async function onRestoreCard(card: CardDraftView) {
    setArchiveBusyId(card.id);
    setError(null);
    try {
      await restoreCard(card.id);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      setAcceptedCount((n) => n + 1);
      if (editCard?.id === card.id) {
        setEditCard(null);
      }
      setNotice("Card restored");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not restore card",
      );
    } finally {
      setArchiveBusyId(null);
    }
  }

  async function onBatchArchive() {
    if (selectedCardIds.size === 0 || showArchived) return;
    setBatchBusy(true);
    setError(null);
    try {
      const ids = [...selectedCardIds];
      for (const id of ids) {
        await archiveCard(id);
      }
      setCards((prev) => prev.filter((c) => !selectedCardIds.has(c.id)));
      setAcceptedCount((n) => Math.max(0, n - ids.length));
      setSelectedCardIds(new Set());
      setNotice(
        ids.length === 1 ? "Card archived" : `${ids.length} cards archived`,
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not archive cards",
      );
    } finally {
      setBatchBusy(false);
    }
  }

  return {
    showArchived,
    setShowArchived,
    archiveBusyId,
    selectedCardIds,
    setSelectedCardIds,
    batchBusy,
    clearSelection,
    onToggleSelect,
    onSelectAll,
    onArchiveCard,
    onRestoreCard,
    onBatchArchive,
  };
}
