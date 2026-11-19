import type { Dispatch, FormEvent, SetStateAction } from "react";
import {
  ApiError,
  createDeck,
  patchDeck,
  patchSubject,
  type Deck,
  type Subject,
} from "../api/client";
import { navigate } from "../shared/nav/navigate";
import type { CoverTarget, TitleDialog } from "./subjectTypes";

export type SubjectTitleDialogsCtx = {
  subjectId: string;
  guest: boolean;
  subject: Subject | null;
  titleDialog: TitleDialog;
  titleValue: string;
  createFlowDeck: Deck | null;
  syncSubjectFromList: () => Promise<Subject | null>;
  setTitleDialog: Dispatch<SetStateAction<TitleDialog>>;
  setTitleValue: Dispatch<SetStateAction<string>>;
  setDialogBusy: Dispatch<SetStateAction<boolean>>;
  setDialogError: Dispatch<SetStateAction<string | null>>;
  setCreateDeckHold: Dispatch<SetStateAction<boolean>>;
  setCreateFlowDeck: Dispatch<SetStateAction<Deck | null>>;
  setCoverPicker: Dispatch<SetStateAction<CoverTarget | null>>;
  setDecks: Dispatch<SetStateAction<Deck[]>>;
  setSubject: Dispatch<SetStateAction<Subject | null>>;
};

export function createSubjectTitleDialogs(ctx: SubjectTitleDialogsCtx) {
  const {
    subjectId,
    guest,
    subject,
    titleDialog,
    titleValue,
    createFlowDeck,
    syncSubjectFromList,
    setTitleDialog,
    setTitleValue,
    setDialogBusy,
    setDialogError,
    setCreateDeckHold,
    setCreateFlowDeck,
    setCoverPicker,
    setDecks,
    setSubject,
  } = ctx;

  function openRenameSubject() {
    if (!subject) return;
    setDialogError(null);
    setTitleValue(subject.title);
    setTitleDialog({ kind: "subject" });
  }

  function openCreateDeck() {
    setDialogError(null);
    setTitleValue("");
    setCreateDeckHold(false);
    setCreateFlowDeck(null);
    setTitleDialog({ kind: "deck-create" });
  }

  function cancelCreateDeck() {
    setTitleDialog(null);
    setCreateDeckHold(false);
    setCoverPicker(null);
    setCreateFlowDeck(null);
    setDialogError(null);
  }

  function finishCreateDeck(deckId: string) {
    setTitleDialog(null);
    setCoverPicker(null);
    setCreateDeckHold(false);
    setCreateFlowDeck(null);
    setDialogError(null);
    navigate(`/library/decks/${encodeURIComponent(deckId)}`);
  }

  function backFromCreateDeckCover() {
    if (!createFlowDeck) {
      cancelCreateDeck();
      return;
    }
    setDialogError(null);
    setTitleValue(createFlowDeck.title);
    setCoverPicker(null);
    setCreateDeckHold(false);
    setTitleDialog({ kind: "deck-create" });
  }

  function closeCreateDeckCover() {
    const createdId = createFlowDeck?.id ?? null;
    setCoverPicker(null);
    setCreateDeckHold(false);
    setCreateFlowDeck(null);
    if (createdId) {
      navigate(`/library/decks/${encodeURIComponent(createdId)}`);
    }
  }

  function openRenameDeck(deck: Deck) {
    setDialogError(null);
    setTitleValue(deck.title);
    setTitleDialog({ kind: "deck-rename", deck });
  }

  async function onTitleDialogSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!titleDialog || !titleValue.trim()) return;
    setDialogBusy(true);
    setDialogError(null);
    try {
      if (titleDialog.kind === "deck-create") {
        const saved = createFlowDeck
          ? await patchDeck(createFlowDeck.id, titleValue.trim())
          : await createDeck(titleValue.trim(), subjectId);
        if (createFlowDeck) {
          setDecks((prev) => prev.map((d) => (d.id === saved.id ? saved : d)));
        } else {
          setDecks((prev) => [...prev, saved]);
          await syncSubjectFromList();
        }
        setCreateFlowDeck(saved);
        setTitleValue(saved.title);
        if (!guest) {
          setCreateDeckHold(true);
          setCoverPicker({
            ownerKind: "deck",
            ownerId: saved.id,
            title: saved.title,
          });
          setTitleDialog(null);
        } else {
          finishCreateDeck(saved.id);
        }
        return;
      }

      let saved: CoverTarget;
      if (titleDialog.kind === "subject") {
        const updated = await patchSubject(subjectId, titleValue.trim());
        setSubject((prev) => (prev ? { ...prev, ...updated } : updated));
        saved = {
          ownerKind: "subject",
          ownerId: updated.id,
          title: updated.title,
        };
      } else {
        const updated = await patchDeck(titleDialog.deck.id, titleValue.trim());
        setDecks((prev) =>
          prev.map((d) => (d.id === updated.id ? updated : d)),
        );
        saved = {
          ownerKind: "deck",
          ownerId: updated.id,
          title: updated.title,
        };
      }
      setTitleDialog(null);
      if (!guest) setCoverPicker(saved);
    } catch (err) {
      setDialogError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setDialogBusy(false);
    }
  }

  return {
    openRenameSubject,
    openCreateDeck,
    cancelCreateDeck,
    finishCreateDeck,
    backFromCreateDeckCover,
    closeCreateDeckCover,
    openRenameDeck,
    onTitleDialogSubmit,
  };
}
