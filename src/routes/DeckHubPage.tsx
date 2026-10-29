import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Switch from "@mui/material/Switch";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import {
  ApiError,
  apkgFilenameForDeckTitle,
  archiveCard,
  createDeckCard,
  createDeckExport,
  deckStats,
  downloadExport,
  deleteDeck,
  listDeckCards,
  listDeckMaterials,
  listDecks,
  listJobsWithDrafts,
  listSubjects,
  me,
  moveCard,
  pasteMaterial,
  patchCard,
  patchDeck,
  PPTX_MIME,
  asRegenType,
  cardHasRegenSource,
  regenCard,
  resetCardSchedule,
  restoreCard,
  resolveUploadContentType,
  topicGenerate,
  uploadMaterialFile,
  uploadPdfWithFigureCrops,
  type CardDraftView,
  type CardType,
  type Deck,
  type DeckStats,
  type JobListItem,
  type MaterialListItem,
  type Subject,
} from "../api/client";
import DraftCardEditor, {
  type DraftEditorChange,
} from "../components/DraftCardEditor";
import { FigureSuggestPanel } from "../components/FigureSuggestPanel";
import MaterialsList from "../components/MaterialsList";
import { isGuest } from "../guest/session";
import { guestPasteToCards } from "../guest/pasteToCards";
import { guestAddAcceptedCards } from "../guest/store";
import { MAX_CLIENT_FIGURES } from "../lib/figureGeometry";
import {
  collectDeckImageKeys,
  hubDiyTypes,
  isOcclusionFront,
  starterOcclusionFront,
  validateHubCreateCard,
} from "../lib/hubDiyCreate";
import { navigate } from "../nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";

type Props = {
  deckId: string;
};

function blankHubCreateCard(deckId: string): CardDraftView {
  return {
    id: "hub-create-draft",
    deck_id: deckId,
    job_id: null,
    type: "qa",
    front: "",
    back: "",
    provenance: null,
    status: "draft",
    created_at: "",
    updated_at: "",
  };
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_UPLOAD_MIMES = new Set([
  "application/pdf",
  PPTX_MIME,
  ...IMAGE_MIMES,
]);

function cardFrontPreview(card: CardDraftView): string {
  if (typeof card.front === "string") return card.front;
  if (
    typeof card.front === "object" &&
    card.front !== null &&
    "prompt" in card.front &&
    typeof card.front.prompt === "string" &&
    card.front.prompt.trim()
  ) {
    return card.front.prompt;
  }
  return card.type === "occlusion" ? "Occlusion card" : "Card";
}

function cardTypeLabel(type: CardDraftView["type"]): string {
  if (type === "cloze") return "Cloze";
  if (type === "mcq") return "MCQ";
  if (type === "occlusion") return "Occlusion";
  if (type === "image_label") return "Image label";
  if (type === "diagram") return "Diagram";
  return "Q&A";
}

function cardPatchBody(card: CardDraftView): Parameters<typeof patchCard>[1] {
  const type = card.type as CardType;
  const body: Parameters<typeof patchCard>[1] = {
    front: card.front,
    back: card.back,
    type,
  };
  if (type === "mcq" && card.options) {
    body.options = card.options;
  }
  return body;
}

export default function DeckHubPage({ deckId }: Props) {
  const guest = isGuest();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [cards, setCards] = useState<CardDraftView[]>([]);
  const [draftJobs, setDraftJobs] = useState<JobListItem[]>([]);
  const [materials, setMaterials] = useState<MaterialListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportWarning, setExportWarning] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteStats, setDeleteStats] = useState<DeckStats | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [editCard, setEditCard] = useState<CardDraftView | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [cardRegenBusy, setCardRegenBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const editDialogBusy = editBusy || resetBusy || cardRegenBusy;

  const [moveTarget, setMoveTarget] = useState<CardDraftView | null>(null);
  const [moveSubjects, setMoveSubjects] = useState<Subject[]>([]);
  const [moveDecks, setMoveDecks] = useState<Deck[]>([]);
  const [moveSubjectId, setMoveSubjectId] = useState("");
  const [moveDeckId, setMoveDeckId] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const [createCard, setCreateCard] = useState<CardDraftView>(() =>
    blankHubCreateCard(deckId),
  );
  const [createBusy, setCreateBusy] = useState(false);
  const [createImageBusy, setCreateImageBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createImageInputRef = useRef<HTMLInputElement>(null);

  const hubDiyAllowedTypes = hubDiyTypes(guest);
  const deckImageKeys = useMemo(() => collectDeckImageKeys(cards), [cards]);
  const createImageKey =
    createCard.media_r2_keys?.[0] ??
    (isOcclusionFront(createCard.front) ? createCard.front.image_key : "");
  const createNeedsImage =
    !guest &&
    (createCard.type === "occlusion" || createCard.type === "image_label");

  const [materialTab, setMaterialTab] = useState<"paste" | "file">("paste");
  const [pasteText, setPasteText] = useState("");
  const [pasteFilename, setPasteFilename] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [figureFiles, setFigureFiles] = useState<File[]>([]);
  const [materialBusy, setMaterialBusy] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [materialNotice, setMaterialNotice] = useState<string | null>(null);

  const [topicOpen, setTopicOpen] = useState(false);
  const [topicValue, setTopicValue] = useState("");
  const [topicBusy, setTopicBusy] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);

  const [showArchived, setShowArchived] = useState(false);
  const [archiveBusyId, setArchiveBusyId] = useState<string | null>(null);

  const { end: endLoad } = useTrackedOp("Loading deck…", {
    trackOnMount: true,
  });
  const { busy: exportBusy, run: runExport } =
    useTrackedOp("Exporting to Anki…");

  const refreshCards = useCallback(async () => {
    setCards(
      await listDeckCards(
        deckId,
        showArchived ? { status: "archived" } : undefined,
      ),
    );
  }, [deckId, showArchived]);

  const refreshDraftJobs = useCallback(async () => {
    if (guest) {
      setDraftJobs([]);
      return;
    }
    try {
      const jobs = await listJobsWithDrafts();
      setDraftJobs(jobs.filter((j) => j.deck_id === deckId));
    } catch {
      setDraftJobs([]);
    }
  }, [deckId, guest]);

  const refreshMaterials = useCallback(async () => {
    if (guest) {
      setMaterials([]);
      return;
    }
    try {
      setMaterials(await listDeckMaterials(deckId));
    } catch {
      setMaterials([]);
    }
  }, [deckId, guest]);

  const load = useCallback(async () => {
    const [deckList, subjects] = await Promise.all([
      listDecks(),
      listSubjects(),
    ]);
    const found = deckList.find((d) => d.id === deckId) ?? null;
    setDeck(found);
    setSubject(
      found ? (subjects.find((s) => s.id === found.subject_id) ?? null) : null,
    );
    if (found) {
      await Promise.all([refreshDraftJobs(), refreshMaterials()]);
    }
    return found;
  }, [deckId, refreshDraftJobs, refreshMaterials]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        const found = await load();
        if (cancelled) return;
        if (!found) setError("Deck not found");
        setReady(true);
        endLoad();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load deck");
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad, load]);

  useEffect(() => {
    if (!ready || !deck) return;
    void refreshCards();
  }, [deck, ready, refreshCards, showArchived]);

  async function onArchiveCard(card: CardDraftView) {
    setArchiveBusyId(card.id);
    setError(null);
    try {
      await archiveCard(card.id);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      if (editCard?.id === card.id) {
        setEditCard(null);
      }
      setNotice("Card archived");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not archive card");
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
      if (editCard?.id === card.id) {
        setEditCard(null);
      }
      setNotice("Card restored");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not restore card");
    } finally {
      setArchiveBusyId(null);
    }
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

  async function openMove(card: CardDraftView) {
    setMoveError(null);
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

  async function confirmMoveCard() {
    if (!moveTarget || !moveDeckId) return;
    setMoveBusy(true);
    setMoveError(null);
    try {
      await moveCard(moveTarget.id, moveDeckId);
      setCards((prev) => prev.filter((c) => c.id !== moveTarget.id));
      if (editCard?.id === moveTarget.id) {
        setEditCard(null);
      }
      const destTitle =
        moveDecks.find((d) => d.id === moveDeckId)?.title ?? "deck";
      setMoveTarget(null);
      setNotice(`Moved card to “${destTitle}”`);
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

  function applyCreateImageKey(key: string) {
    setCreateCard((prev) => {
      if (prev.type === "occlusion" && isOcclusionFront(prev.front)) {
        return {
          ...prev,
          media_r2_keys: [key],
          front: { ...prev.front, image_key: key },
        };
      }
      return { ...prev, media_r2_keys: [key] };
    });
  }

  async function onCreateImageUpload(file: File) {
    setCreateError(null);
    const contentType = resolveUploadContentType(file);
    if (!IMAGE_MIMES.has(contentType)) {
      setCreateError("Use a JPEG, PNG, or WebP image");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setCreateError("Images must be 8MB or smaller");
      return;
    }
    setCreateImageBusy(true);
    try {
      const material = await uploadMaterialFile(deckId, file, undefined, {
        attachOnly: true,
      });
      if (!material.r2_key) {
        setCreateError("Upload did not return an image key");
        return;
      }
      applyCreateImageKey(material.r2_key);
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Could not upload image",
      );
    } finally {
      setCreateImageBusy(false);
      if (createImageInputRef.current) {
        createImageInputRef.current.value = "";
      }
    }
  }

  function onCreateChange(next: DraftEditorChange) {
    setCreateCard((prev) => {
      const imageKey = prev.media_r2_keys?.[0] ?? "";
      let front = next.front;
      let back = next.back;
      if (
        next.type === "occlusion" &&
        typeof front === "string" &&
        !isOcclusionFront(front)
      ) {
        front = starterOcclusionFront(imageKey);
        back = { answer: "r1" };
      }
      return {
        ...prev,
        front,
        back,
        type: next.type,
        options: next.options,
      };
    });
  }

  async function onCreateCard(e?: FormEvent) {
    e?.preventDefault();
    setCreateError(null);
    const validated = validateHubCreateCard(createCard);
    if (!validated.ok) {
      setCreateError(validated.error);
      return;
    }
    setCreateBusy(true);
    try {
      const created = await createDeckCard(deckId, validated.body);
      if (!showArchived) {
        setCards((prev) => [...prev, created]);
      }
      setCreateCard(blankHubCreateCard(deckId));
      setNotice("Card added");
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Could not create card",
      );
    } finally {
      setCreateBusy(false);
    }
  }

  async function onGuestPaste(e?: FormEvent) {
    e?.preventDefault();
    setMaterialError(null);
    setMaterialNotice(null);
    const { cards: pairs, truncated } = guestPasteToCards(pasteText);
    if (pairs.length === 0) {
      setMaterialError(
        "Paste needs clearer paragraphs or Q&A lines (blank line between cards).",
      );
      return;
    }
    setMaterialBusy(true);
    try {
      const added = guestAddAcceptedCards(deckId, pairs);
      if (added.length === 0) {
        setMaterialError("Could not save. Try again.");
        return;
      }
      setPasteText("");
      await refreshCards();
      const truncNote = truncated
        ? ` (kept first ${added.length}; paste was longer than the 40-card limit)`
        : "";
      setMaterialNotice(`Added ${added.length} local cards${truncNote}`);
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" || err.code === 22)
      ) {
        setMaterialError(
          "Browser storage is full. Shorten the paste or clear guest data, then try again.",
        );
      } else {
        setMaterialError("Could not save local cards");
      }
    } finally {
      setMaterialBusy(false);
    }
  }

  async function onExportAnki() {
    if (!deck || guest) return;
    setError(null);
    setExportWarning(null);
    try {
      await runExport(async () => {
        const job = await createDeckExport(deck.id);
        const { missingMedia, skippedCards } = job.warnings;
        await downloadExport(job.id, apkgFilenameForDeckTitle(deck.title));
        if (missingMedia > 0 || skippedCards > 0) {
          const parts: string[] = [];
          if (skippedCards > 0) {
            parts.push(
              `${skippedCards} card${skippedCards === 1 ? "" : "s"} skipped`,
            );
          }
          if (missingMedia > 0) {
            parts.push(
              `${missingMedia} missing media file${missingMedia === 1 ? "" : "s"}`,
            );
          }
          setExportWarning(
            `Download started. Export warnings: ${parts.join("; ")}.`,
          );
        } else {
          setNotice("Anki deck downloaded");
        }
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    }
  }

  async function onTopicGenerate(e?: FormEvent) {
    e?.preventDefault();
    const topic = topicValue.trim();
    if (!topic) {
      setTopicError("Enter a topic");
      return;
    }
    setTopicBusy(true);
    setTopicError(null);
    try {
      const { jobId } = await topicGenerate(deckId, { topic });
      setTopicOpen(false);
      setTopicValue("");
      window.location.assign(`/jobs/${encodeURIComponent(jobId)}/drafts`);
    } catch (err) {
      setTopicError(
        err instanceof ApiError ? err.message : "Could not start generation",
      );
    } finally {
      setTopicBusy(false);
    }
  }

  async function onAccountPaste(e?: FormEvent) {
    e?.preventDefault();
    setMaterialError(null);
    setMaterialNotice(null);
    if (!pasteText.trim()) {
      setMaterialError("Paste some text first");
      return;
    }
    setMaterialBusy(true);
    try {
      const material = await pasteMaterial(deckId, {
        text: pasteText,
        ...(pasteFilename.trim() ? { filename: pasteFilename.trim() } : {}),
      });
      setPasteText("");
      setPasteFilename("");
      if (material.jobId) {
        window.location.assign(
          `/jobs/${encodeURIComponent(material.jobId)}/drafts`,
        );
        return;
      }
      setMaterialNotice(`Saved paste material (${material.status})`);
      await Promise.all([refreshDraftJobs(), refreshMaterials()]);
    } catch (err) {
      setMaterialError(
        err instanceof ApiError ? err.message : "Could not save paste",
      );
    } finally {
      setMaterialBusy(false);
    }
  }

  async function onUploadFile(e?: FormEvent) {
    e?.preventDefault();
    setMaterialError(null);
    setMaterialNotice(null);
    if (!uploadFile) {
      setMaterialError("Choose a PDF, PPTX, or image file");
      return;
    }
    const contentType = resolveUploadContentType(uploadFile);
    if (!ALLOWED_UPLOAD_MIMES.has(contentType)) {
      setMaterialError(
        "Only PDF, PPTX, or image (jpeg/png/webp) files are allowed",
      );
      return;
    }
    if (uploadFile.size > MAX_FILE_BYTES) {
      setMaterialError("File must be 25MB or smaller");
      return;
    }
    if (IMAGE_MIMES.has(contentType) && uploadFile.size > MAX_IMAGE_BYTES) {
      setMaterialError("Images for generation must be 8MB or smaller");
      return;
    }
    if (figureFiles.length > MAX_CLIENT_FIGURES) {
      setMaterialError(`Attach at most ${MAX_CLIENT_FIGURES} figure crops`);
      return;
    }
    for (const figure of figureFiles) {
      if (resolveUploadContentType(figure) !== "image/png") {
        setMaterialError("Figure crops must be PNG images");
        return;
      }
      if (figure.size > MAX_IMAGE_BYTES) {
        setMaterialError("Figure crops must be 8MB or smaller");
        return;
      }
    }
    setMaterialBusy(true);
    try {
      const material =
        contentType === "application/pdf" && figureFiles.length > 0
          ? await uploadPdfWithFigureCrops(deckId, uploadFile, figureFiles)
          : await uploadMaterialFile(deckId, uploadFile);
      setUploadFile(null);
      setFigureFiles([]);
      if (material.jobId) {
        setMaterialNotice(
          `Stored file (${material.status}). Generation started.`,
        );
        window.location.assign(
          `/jobs/${encodeURIComponent(material.jobId)}/drafts`,
        );
        return;
      }
      setMaterialNotice(`Stored file (${material.status}).`);
      await Promise.all([refreshDraftJobs(), refreshMaterials()]);
    } catch (err) {
      setMaterialError(
        err instanceof ApiError ? err.message : "Could not upload file",
      );
    } finally {
      setMaterialBusy(false);
    }
  }

  const subjectHref = subject
    ? `/library/subjects/${encodeURIComponent(subject.id)}`
    : "/library";

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 5 } }}>
      {!ready ? (
        <Typography color="text.secondary">Loading deck…</Typography>
      ) : (
        <Stack spacing={3}>
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <Link
                href="/library"
                underline="hover"
                color="primary"
                onClick={(ev) => {
                  ev.preventDefault();
                  navigate("/library");
                }}
              >
                Library
              </Link>
              {subject ? (
                <>
                  {" / "}
                  <Link
                    href={subjectHref}
                    underline="hover"
                    color="primary"
                    onClick={(ev) => {
                      ev.preventDefault();
                      navigate(subjectHref);
                    }}
                  >
                    {subject.title}
                  </Link>
                </>
              ) : null}
            </Typography>
            <Stack
              direction="row"
              alignItems="flex-start"
              justifyContent="space-between"
              gap={1}
            >
              <Typography
                variant="h4"
                component="h1"
                sx={{ color: "text.primary", fontWeight: 600, flex: 1 }}
              >
                {deck?.title ?? "Deck"}
              </Typography>
              {deck ? (
                <Stack direction="row" spacing={0.5}>
                  <IconButton
                    size="small"
                    aria-label="Rename deck"
                    onClick={() => {
                      setRenameError(null);
                      setRenameValue(deck.title);
                      setRenameOpen(true);
                    }}
                  >
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label="Delete deck"
                    onClick={openDelete}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ) : null}
            </Stack>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mt: 1 }}
            >
              {deck ? (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    navigate(`/study?deckId=${encodeURIComponent(deck.id)}`)
                  }
                >
                  Study this deck
                </Button>
              ) : null}
              {!guest && deck ? (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setTopicError(null);
                    setTopicValue("");
                    setTopicOpen(true);
                  }}
                >
                  Generate cards for topic…
                </Button>
              ) : null}
              {!guest && deck ? (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={exportBusy || cards.length === 0}
                  onClick={() => {
                    void onExportAnki();
                  }}
                >
                  {exportBusy ? "Exporting…" : "Export to Anki"}
                </Button>
              ) : null}
              <Typography variant="body2" color="text.secondary">
                Cards, materials, and drafts for this deck.
              </Typography>
            </Stack>
          </Box>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {notice ? (
            <Alert severity="success" onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          ) : null}
          {exportWarning ? (
            <Alert severity="warning" onClose={() => setExportWarning(null)}>
              {exportWarning}
            </Alert>
          ) : null}

          {deck ? (
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                bgcolor: "background.paper",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
              >
                Add material
              </Typography>
              {materialError ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {materialError}
                </Alert>
              ) : null}
              {materialNotice ? (
                <Alert severity="success" sx={{ mb: 2 }}>
                  {materialNotice}
                </Alert>
              ) : null}
              {guest ? (
                <Stack spacing={2}>
                  <Alert severity="info">
                    Cards stay in this browser only. Sign in for uploads and AI
                    generation.
                  </Alert>
                  <Box component="form" onSubmit={onGuestPaste} noValidate>
                    <Stack spacing={2}>
                      <TextField
                        label="Paste text"
                        value={pasteText}
                        onChange={(ev) => setPasteText(ev.target.value)}
                        required
                        fullWidth
                        multiline
                        minRows={5}
                      />
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={materialBusy || !pasteText.trim()}
                      >
                        {materialBusy ? "Saving…" : "Save paste"}
                      </Button>
                    </Stack>
                  </Box>
                </Stack>
              ) : (
                <Box>
                  <Tabs
                    value={materialTab}
                    onChange={(_ev, v: "paste" | "file") => setMaterialTab(v)}
                    aria-label="material-type-tabs"
                    sx={{ mb: 2 }}
                  >
                    <Tab value="paste" label="Paste" />
                    <Tab value="file" label="Upload" />
                  </Tabs>
                  {materialTab === "paste" ? (
                    <Box component="form" onSubmit={onAccountPaste} noValidate>
                      <Stack spacing={2}>
                        <TextField
                          label="Filename (optional)"
                          value={pasteFilename}
                          onChange={(ev) => setPasteFilename(ev.target.value)}
                          fullWidth
                        />
                        <TextField
                          label="Paste text"
                          value={pasteText}
                          onChange={(ev) => setPasteText(ev.target.value)}
                          required
                          fullWidth
                          multiline
                          minRows={5}
                        />
                        <Button
                          type="submit"
                          variant="contained"
                          disabled={materialBusy || !pasteText.trim()}
                        >
                          {materialBusy ? "Saving…" : "Save paste"}
                        </Button>
                      </Stack>
                    </Box>
                  ) : (
                    <Box component="form" onSubmit={onUploadFile} noValidate>
                      <Stack spacing={2}>
                        <Button
                          variant="outlined"
                          component="label"
                          disabled={materialBusy}
                        >
                          {uploadFile
                            ? uploadFile.name
                            : "Choose PDF, PPTX, or image"}
                          <input
                            type="file"
                            accept="application/pdf,.pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                            hidden
                            onChange={(ev) => {
                              const file = ev.target.files?.[0] ?? null;
                              setUploadFile(file);
                              if (
                                !file ||
                                resolveUploadContentType(file) !==
                                  "application/pdf"
                              ) {
                                setFigureFiles([]);
                              }
                            }}
                          />
                        </Button>
                        {uploadFile &&
                        resolveUploadContentType(uploadFile) ===
                          "application/pdf" ? (
                          <Stack spacing={1.5}>
                            <FigureSuggestPanel
                              pdfFile={uploadFile}
                              disabled={materialBusy}
                              crops={figureFiles}
                              onCropsChange={setFigureFiles}
                            />
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Optional: Suggest or drag-crop figures on-device.
                              Accept appends up to {MAX_CLIENT_FIGURES} PNG
                              crops.
                            </Typography>
                          </Stack>
                        ) : null}
                        <Button
                          type="submit"
                          variant="contained"
                          disabled={materialBusy || !uploadFile}
                        >
                          {materialBusy ? "Uploading…" : "Upload"}
                        </Button>
                      </Stack>
                    </Box>
                  )}
                </Box>
              )}
            </Paper>
          ) : null}

          {!guest ? (
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                bgcolor: "background.paper",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
              >
                Materials
              </Typography>
              <MaterialsList
                materials={materials}
                showDeckTitle={false}
                onChanged={() => {
                  void Promise.all([
                    refreshMaterials(),
                    refreshDraftJobs(),
                    refreshCards(),
                  ]);
                }}
              />
            </Paper>
          ) : null}

          {!guest && draftJobs.length > 0 ? (
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                bgcolor: "background.paper",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
              >
                Drafts for this deck
              </Typography>
              <Stack
                component="ul"
                spacing={0}
                divider={<Divider flexItem />}
                sx={{ m: 0, p: 0, listStyle: "none" }}
              >
                {draftJobs.map((job) => (
                  <Box component="li" key={job.id} sx={{ py: 1 }}>
                    <Link
                      href={`/jobs/${encodeURIComponent(job.id)}/drafts`}
                      underline="hover"
                      color="primary"
                      variant="body2"
                      onClick={(ev) => {
                        ev.preventDefault();
                        navigate(`/jobs/${encodeURIComponent(job.id)}/drafts`);
                      }}
                    >
                      {job.filename?.trim() || "Untitled material"}
                      {" · "}
                      {job.draft_count} draft
                      {job.draft_count === 1 ? "" : "s"}
                    </Link>
                  </Box>
                ))}
              </Stack>
            </Paper>
          ) : null}

          {deck ? (
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                bgcolor: "background.paper",
                borderColor: "divider",
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 1.5 }}
              >
                <Typography
                  variant="subtitle1"
                  component="h2"
                  sx={{ fontWeight: 600, color: "primary.main" }}
                >
                  Cards
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={showArchived}
                      onChange={(_ev, checked) => setShowArchived(checked)}
                      disabled={archiveBusyId !== null}
                    />
                  }
                  label="Show archived"
                  sx={{ mr: 0 }}
                />
              </Stack>
              {cards.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {showArchived
                    ? "No archived cards."
                    : "No accepted cards yet. Add one below or paste material."}
                </Typography>
              ) : (
                <Stack
                  component="ul"
                  spacing={0}
                  divider={<Divider flexItem />}
                  sx={{ m: 0, p: 0, listStyle: "none" }}
                >
                  {cards.map((card) => (
                    <Box
                      component="li"
                      key={card.id}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        py: 1,
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" noWrap>
                          {cardFrontPreview(card)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {cardTypeLabel(card.type)}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        aria-label="Move card"
                        disabled={archiveBusyId !== null}
                        onClick={() => {
                          void openMove(card);
                        }}
                      >
                        <DriveFileMoveOutlinedIcon fontSize="small" />
                      </IconButton>
                      {!showArchived && card.status !== "archived" ? (
                        <IconButton
                          size="small"
                          aria-label="Edit card"
                          disabled={archiveBusyId !== null}
                          onClick={() => openEdit(card)}
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      ) : null}
                      {showArchived ? (
                        <IconButton
                          size="small"
                          aria-label="Restore card"
                          disabled={archiveBusyId !== null}
                          onClick={() => {
                            void onRestoreCard(card);
                          }}
                        >
                          <UnarchiveOutlinedIcon fontSize="small" />
                        </IconButton>
                      ) : (
                        <IconButton
                          size="small"
                          aria-label="Archive card"
                          disabled={archiveBusyId !== null}
                          onClick={() => {
                            void onArchiveCard(card);
                          }}
                        >
                          <ArchiveOutlinedIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  ))}
                </Stack>
              )}
            </Paper>
          ) : null}

          {deck ? (
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                bgcolor: "background.paper",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
              >
                Add card
              </Typography>
              {createError ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {createError}
                </Alert>
              ) : null}
              <Box component="form" onSubmit={onCreateCard} noValidate>
                <Stack spacing={2}>
                  {createNeedsImage ? (
                    <Stack spacing={1}>
                      <Typography variant="body2" color="text.secondary">
                        Image (deck material)
                      </Typography>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        {deckImageKeys.length > 0 ? (
                          <FormControl fullWidth size="small">
                            <InputLabel id="hub-create-image-key">
                              Existing image
                            </InputLabel>
                            <Select
                              labelId="hub-create-image-key"
                              label="Existing image"
                              value={createImageKey || ""}
                              disabled={createBusy || createImageBusy}
                              onChange={(ev) =>
                                applyCreateImageKey(String(ev.target.value))
                              }
                            >
                              <MenuItem value="">
                                <em>Select…</em>
                              </MenuItem>
                              {deckImageKeys.map((key) => (
                                <MenuItem key={key} value={key}>
                                  {key.split("/").pop() ?? key}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        ) : null}
                        <Button
                          variant="outlined"
                          component="label"
                          disabled={createBusy || createImageBusy}
                          sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                        >
                          {createImageBusy ? "Uploading…" : "Upload image"}
                          <input
                            ref={createImageInputRef}
                            type="file"
                            hidden
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(ev) => {
                              const file = ev.target.files?.[0];
                              if (file) void onCreateImageUpload(file);
                            }}
                          />
                        </Button>
                      </Stack>
                    </Stack>
                  ) : null}
                  <DraftCardEditor
                    card={createCard}
                    disabled={createBusy || createImageBusy}
                    onChange={onCreateChange}
                    allowedTypes={hubDiyAllowedTypes}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={createBusy || createImageBusy}
                  >
                    {createBusy ? "Adding…" : "Add card"}
                  </Button>
                </Stack>
              </Box>
            </Paper>
          ) : null}
        </Stack>
      )}

      <Dialog
        open={renameOpen}
        onClose={() => !renameBusy && setRenameOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <Box component="form" onSubmit={onRenameSubmit} noValidate>
          <DialogTitle>Rename deck</DialogTitle>
          <DialogContent>
            {renameError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {renameError}
              </Alert>
            ) : null}
            <TextField
              autoFocus
              margin="dense"
              label="Title"
              value={renameValue}
              onChange={(ev) => setRenameValue(ev.target.value)}
              required
              fullWidth
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRenameOpen(false)} disabled={renameBusy}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={renameBusy || !renameValue.trim()}
            >
              {renameBusy ? "Saving…" : "Save"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={topicOpen}
        onClose={() => !topicBusy && setTopicOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={onTopicGenerate} noValidate>
          <DialogTitle>Generate cards for topic</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              Uses the latest ready paste or PDF on this deck. Existing cards
              stay.
            </DialogContentText>
            {topicError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {topicError}
              </Alert>
            ) : null}
            <TextField
              autoFocus
              label="Topic"
              value={topicValue}
              onChange={(ev) => setTopicValue(ev.target.value)}
              required
              fullWidth
              disabled={topicBusy}
              inputProps={{ maxLength: 200 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTopicOpen(false)} disabled={topicBusy}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={topicBusy || !topicValue.trim()}
            >
              {topicBusy ? "Starting…" : "Generate"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => !deleteBusy && setConfirmDelete(false)}
      >
        <DialogTitle>Delete deck?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deck && deleteStats
              ? `Delete “${deck.title}”? This removes ${deleteStats.accepted} accepted card${deleteStats.accepted === 1 ? "" : "s"}, ${deleteStats.draft} draft${deleteStats.draft === 1 ? "" : "s"}, ${deleteStats.archived} archived card${deleteStats.archived === 1 ? "" : "s"}, and ${deleteStats.materials} material${deleteStats.materials === 1 ? "" : "s"}.`
              : deck
                ? `Loading counts for “${deck.title}”…`
                : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)} disabled={deleteBusy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteBusy || !deleteStats}
            onClick={confirmDeleteDeck}
          >
            {deleteBusy ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editCard !== null}
        onClose={() => !editDialogBusy && setEditCard(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit card</DialogTitle>
        <DialogContent>
          {editError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          ) : null}
          {editCard ? (
            <Box sx={{ pt: 1 }}>
              <DraftCardEditor
                card={editCard}
                disabled={editDialogBusy}
                onChange={onEditChange}
                allowedTypes={hubDiyAllowedTypes}
                regenAction={
                  guest
                    ? undefined
                    : {
                        busy: cardRegenBusy,
                        disabled:
                          asRegenType(editCard.type) === null ||
                          !cardHasRegenSource(editCard),
                        onClick: () => {
                          void onRegenEditCard();
                        },
                      }
                }
              />
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button
            disabled={editDialogBusy || !editCard}
            onClick={() => {
              if (editCard) void openMove(editCard);
            }}
          >
            Move…
          </Button>
          <Button
            color="warning"
            disabled={editDialogBusy || !editCard}
            onClick={() => setConfirmReset(true)}
          >
            Reset schedule
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setEditCard(null)} disabled={editDialogBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={editDialogBusy || !editCard}
            onClick={saveEdit}
          >
            {editBusy ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={moveTarget !== null}
        onClose={() => !moveBusy && setMoveTarget(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Move card</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Choose a subject and deck. The card leaves this deck; its study
            schedule stays the same.
          </DialogContentText>
          {moveError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {moveError}
            </Alert>
          ) : null}
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl fullWidth disabled={moveBusy || moveSubjects.length === 0}>
              <InputLabel id="move-subject-label">Subject</InputLabel>
              <Select
                labelId="move-subject-label"
                label="Subject"
                value={moveSubjectId}
                onChange={(ev) => onMoveSubjectChange(ev.target.value)}
              >
                {moveSubjects.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl
              fullWidth
              disabled={moveBusy || moveDeckChoices.length === 0}
            >
              <InputLabel id="move-deck-label">Deck</InputLabel>
              <Select
                labelId="move-deck-label"
                label="Deck"
                value={moveDeckId}
                onChange={(ev) => setMoveDeckId(ev.target.value)}
                displayEmpty
                renderValue={(value) => {
                  if (!value) {
                    return moveDeckChoices.length === 0
                      ? "No other decks in this subject"
                      : "Choose a deck";
                  }
                  return (
                    moveDecks.find((d) => d.id === value)?.title ??
                    "Choose a deck"
                  );
                }}
              >
                {moveDeckChoices.map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    {d.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveTarget(null)} disabled={moveBusy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={moveBusy || !moveDeckId}
            onClick={() => {
              void confirmMoveCard();
            }}
          >
            {moveBusy ? "Moving…" : "Move"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmReset}
        onClose={() => !resetBusy && setConfirmReset(false)}
      >
        <DialogTitle>Reset schedule?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This sets the card’s FSRS schedule back to a new card (due now).
            Your card text is unchanged.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReset(false)} disabled={resetBusy}>
            Cancel
          </Button>
          <Button
            color="warning"
            variant="contained"
            disabled={resetBusy}
            onClick={confirmResetSchedule}
          >
            {resetBusy ? "Resetting…" : "Reset schedule"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
