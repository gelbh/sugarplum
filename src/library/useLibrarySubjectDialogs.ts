import {
  useState,
  type Dispatch,
  type FormEvent,
  type MouseEvent,
  type SetStateAction,
} from "react";
import {
  ApiError,
  clearCover,
  createSubject,
  deleteSubject,
  patchSubject,
  type Deck,
  type StoredCoverRow,
  type Subject,
} from "../api/client";
import { subjectDeleteBlocked } from "../subjects/subjectDeleteGuard";

type TitleDialog =
  | { mode: "create" }
  | { mode: "rename"; subject: Subject }
  | null;

type CoverTarget = {
  ownerKind: "subject";
  ownerId: string;
  title: string;
};

type Args = {
  guest: boolean;
  decks: Deck[];
  setSubjects: Dispatch<SetStateAction<Subject[]>>;
  setCovers: Dispatch<SetStateAction<StoredCoverRow[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  refreshSubjects: () => Promise<void>;
  refreshDecks: () => Promise<void>;
};

export function useLibrarySubjectDialogs({
  guest,
  decks,
  setSubjects,
  setCovers,
  setError,
  refreshSubjects,
  refreshDecks,
}: Args) {
  const [titleDialog, setTitleDialog] = useState<TitleDialog>(null);
  const [titleValue, setTitleValue] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [deleteSubjectTarget, setDeleteSubjectTarget] =
    useState<Subject | null>(null);
  const [deleteSubjectBusy, setDeleteSubjectBusy] = useState(false);
  const [subjectMenu, setSubjectMenu] = useState<{
    anchor: HTMLElement;
    subject: Subject;
  } | null>(null);
  const [coverPicker, setCoverPicker] = useState<CoverTarget | null>(null);

  function openCreateSubject() {
    setDialogError(null);
    setTitleValue("");
    setTitleDialog({ mode: "create" });
  }

  function openRenameSubject(subject: Subject, ev: MouseEvent) {
    ev.stopPropagation();
    setDialogError(null);
    setTitleValue(subject.title);
    setTitleDialog({ mode: "rename", subject });
  }

  async function onTitleDialogSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!titleDialog || !titleValue.trim()) return;
    setDialogBusy(true);
    setDialogError(null);
    try {
      const saved =
        titleDialog.mode === "create"
          ? await createSubject(titleValue.trim())
          : await patchSubject(titleDialog.subject.id, titleValue.trim());
      if (titleDialog.mode === "create") {
        setSubjects((prev) => [...prev, saved]);
      } else {
        setSubjects((prev) =>
          prev.map((s) => (s.id === saved.id ? { ...s, ...saved } : s)),
        );
      }
      setTitleDialog(null);
      if (!guest) {
        setCoverPicker({
          ownerKind: "subject",
          ownerId: saved.id,
          title: saved.title,
        });
      }
    } catch (err) {
      setDialogError(
        err instanceof ApiError ? err.message : "Could not save subject",
      );
    } finally {
      setDialogBusy(false);
    }
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
    setCoverPicker(null);
  }

  function localDeckCountForSubject(subjectId: string) {
    return decks.filter((d) => d.subject_id === subjectId).length;
  }

  function requestDeleteSubject(subject: Subject, ev: MouseEvent) {
    ev.stopPropagation();
    const localCount = localDeckCountForSubject(subject.id);
    if (subjectDeleteBlocked(subject, localCount)) return;
    setError(null);
    setDeleteSubjectTarget(subject);
  }

  async function confirmDeleteSubject() {
    if (!deleteSubjectTarget) return;
    setDeleteSubjectBusy(true);
    setError(null);
    try {
      await deleteSubject(deleteSubjectTarget.id);
      setSubjects((prev) =>
        prev.filter((s) => s.id !== deleteSubjectTarget.id),
      );
      setDeleteSubjectTarget(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await Promise.all([refreshSubjects(), refreshDecks()]);
        setDeleteSubjectTarget(null);
      }
      setError(
        err instanceof ApiError ? err.message : "Could not delete subject",
      );
    } finally {
      setDeleteSubjectBusy(false);
    }
  }

  const menuSubject = subjectMenu?.subject ?? null;
  const menuDeleteBlocked = menuSubject
    ? subjectDeleteBlocked(
        menuSubject,
        localDeckCountForSubject(menuSubject.id),
      )
    : false;

  return {
    titleDialog,
    setTitleDialog,
    titleValue,
    setTitleValue,
    dialogBusy,
    dialogError,
    deleteSubjectTarget,
    setDeleteSubjectTarget,
    deleteSubjectBusy,
    subjectMenu,
    setSubjectMenu,
    coverPicker,
    setCoverPicker,
    openCreateSubject,
    openRenameSubject,
    onTitleDialogSubmit,
    onClearCover,
    localDeckCountForSubject,
    requestDeleteSubject,
    confirmDeleteSubject,
    menuSubject,
    menuDeleteBlocked,
  };
}
