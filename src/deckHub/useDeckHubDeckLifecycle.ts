import {
  useCallback,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  ApiError,
  clearCover,
  deckStats,
  deleteDeck,
  listCovers,
  patchDeck,
  type Deck,
  type DeckStats,
  type StoredCoverRow,
  type Subject,
} from "../api/client";
import { navigate } from "../shared/nav/navigate";

type Args = {
  deckId: string;
  guest: boolean;
  deck: Deck | null;
  setDeck: Dispatch<SetStateAction<Deck | null>>;
  subject: Subject | null;
  setError: Dispatch<SetStateAction<string | null>>;
};

export function useDeckHubDeckLifecycle({
  deckId,
  guest,
  deck,
  setDeck,
  subject,
  setError,
}: Args) {
  const [deckCover, setDeckCover] = useState<StoredCoverRow | null>(null);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteStats, setDeleteStats] = useState<DeckStats | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refreshDeckCover = useCallback(async () => {
    if (guest) {
      setDeckCover(null);
      return;
    }
    try {
      const covers = await listCovers();
      setDeckCover(
        covers.find(
          (cover) => cover.ownerKind === "deck" && cover.ownerId === deckId,
        ) ?? null,
      );
    } catch {
      setDeckCover(null);
    }
  }, [deckId, guest]);

  function openCoverPicker() {
    setCoverPickerOpen(true);
  }

  function closeCoverPicker() {
    setCoverPickerOpen(false);
  }

  function onCoverSaved(row: StoredCoverRow) {
    setDeckCover(row);
    setCoverPickerOpen(false);
  }

  async function onCoverClear() {
    if (!deck) return;
    await clearCover("deck", deck.id);
    setDeckCover(null);
    setCoverPickerOpen(false);
  }

  function openRename() {
    if (!deck) return;
    setRenameError(null);
    setRenameValue(deck.title);
    setRenameOpen(true);
  }

  async function onRenameSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!deck || !renameValue.trim()) return;
    setRenameBusy(true);
    setRenameError(null);
    try {
      const updated = await patchDeck(deck.id, renameValue.trim());
      setDeck(updated);
      setRenameOpen(false);
    } catch (err) {
      setRenameError(
        err instanceof ApiError ? err.message : "Could not rename",
      );
    } finally {
      setRenameBusy(false);
    }
  }

  async function openDelete() {
    if (!deck) return;
    setError(null);
    setConfirmDelete(true);
    setDeleteStats(null);
    try {
      setDeleteStats(await deckStats(deck.id));
    } catch (err) {
      setConfirmDelete(false);
      setError(
        err instanceof ApiError ? err.message : "Could not load deck stats",
      );
    }
  }

  async function confirmDeleteDeck() {
    if (!deck) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await deleteDeck(deck.id);
      const subjectPath = subject
        ? `/library/subjects/${encodeURIComponent(subject.id)}`
        : "/library";
      navigate(subjectPath);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete deck");
    } finally {
      setDeleteBusy(false);
    }
  }

  return {
    deckCover,
    refreshDeckCover,
    coverPickerOpen,
    openCoverPicker,
    closeCoverPicker,
    onCoverSaved,
    onCoverClear,
    renameOpen,
    setRenameOpen,
    renameValue,
    setRenameValue,
    renameBusy,
    renameError,
    openRename,
    onRenameSubmit,
    deleteStats,
    deleteBusy,
    confirmDelete,
    setConfirmDelete,
    openDelete,
    confirmDeleteDeck,
  };
}
