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
import { navigate } from "../shared/nav/navigate";
import { subjectDeleteBlocked } from "../subjects/subjectDeleteGuard";

export type LibraryTitleDialog =
  { mode: "create" } | { mode: "rename"; subject: Subject } | null;

export type LibraryCoverTarget = {
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
  const [titleDialog, setTitleDialog] = useState<LibraryTitleDialog>(null);
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
  const [coverPicker, setCoverPicker] = useState<LibraryCoverTarget | null>(
    null,
  );
  /** Keeps the create pane mounted while the post-create cover picker is open. */
  const [createCoverHold, setCreateCoverHold] = useState(false);
  /** Subject already created in this flow; later Continues patch instead of re-create. */
  const [createFlowSubject, setCreateFlowSubject] = useState<Subject | null>(
    null,
  );

  function openCreateSubject() {
    setDialogError(null);
    setTitleValue("");
    setCreateCoverHold(false);
    setCreateFlowSubject(null);
    setTitleDialog({ mode: "create" });
  }

  function cancelCreateSubject() {
    setTitleDialog(null);
    setCreateCoverHold(false);
    setCoverPicker(null);
    setCreateFlowSubject(null);
    setDialogError(null);
  }

  function backFromCreateCover() {
    if (!createFlowSubject) {
      closeCoverPicker();
      return;
    }
    setDialogError(null);
    setTitleValue(createFlowSubject.title);
    setCoverPicker(null);
    setCreateCoverHold(false);
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
      if (titleDialog.mode === "create") {
        const saved = createFlowSubject
          ? await patchSubject(createFlowSubject.id, titleValue.trim())
          : await createSubject(titleValue.trim());
        if (createFlowSubject) {
          setSubjects((prev) =>
            prev.map((s) => (s.id === saved.id ? { ...s, ...saved } : s)),
          );
        } else {
          setSubjects((prev) => [...prev, saved]);
        }
        setCreateFlowSubject(saved);
        setTitleValue(saved.title);
        if (!guest) {
          setCreateCoverHold(true);
          setCoverPicker({
            ownerKind: "subject",
            ownerId: saved.id,
            title: saved.title,
          });
          setTitleDialog(null);
        } else {
          finishCreateSubject(saved.id);
        }
      } else {
        const saved = await patchSubject(
          titleDialog.subject.id,
          titleValue.trim(),
        );
        setSubjects((prev) =>
          prev.map((s) => (s.id === saved.id ? { ...s, ...saved } : s)),
        );
        setTitleDialog(null);
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
    closeCoverPicker();
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

  function finishCreateSubject(subjectId: string) {
    setTitleDialog(null);
    setCoverPicker(null);
    setCreateCoverHold(false);
    setCreateFlowSubject(null);
    setDialogError(null);
    navigate(`/library/subjects/${encodeURIComponent(subjectId)}`);
  }

  function closeCoverPicker() {
    const createdId = createFlowSubject?.id ?? null;
    setCoverPicker(null);
    setCreateCoverHold(false);
    setCreateFlowSubject(null);
    if (createdId) {
      navigate(`/library/subjects/${encodeURIComponent(createdId)}`);
    }
  }

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
    createCoverHold,
    closeCoverPicker,
    openCreateSubject,
    cancelCreateSubject,
    backFromCreateCover,
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
