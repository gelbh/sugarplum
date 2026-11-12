import {
  useCallback,
  useEffect,
  useMemo,
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
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddMaterialWorkshop from "../deckHub/AddMaterialWorkshop";
import CompositionSpark from "../components/CompositionSpark";
import CoverPickerDialog from "../components/CoverPickerDialog";
import CardsWorkshop from "../deckHub/CardsWorkshop";
import DeckHubTitleHeader from "../deckHub/DeckHubTitleHeader";
import DraftsWorkshop from "../deckHub/DraftsWorkshop";
import MissionBoard, { type MissionTileId } from "../deckHub/MissionBoard";
import StudyReadySheet from "../deckHub/StudyReadySheet";
import WorkshopShell from "../deckHub/WorkshopShell";
import {
  popWorkshop,
  pushWorkshop,
  replaceWorkshop,
  type WorkshopFrame,
} from "../deckHub/workshopStack";
import { useCreateCardController } from "../deckHub/useCreateCardController";
import { useAddMaterialWorkshop } from "../deckHub/useAddMaterialWorkshop";
import { useCardsWorkshop } from "../deckHub/useCardsWorkshop";
import { useStudyReadySheet } from "../deckHub/useStudyReadySheet";
import "../deckHub/deckHubMotion.css";
import {
  ApiError,
  apkgFilenameForDeckTitle,
  clearCover,
  createDeckExport,
  deckStats,
  deleteDeck,
  getDeckComposition,
  listCovers,
  listDeckCards,
  listDeckMaterials,
  listDecks,
  listJobsWithDrafts,
  listSubjects,
  me,
  moveCard,
  patchCard,
  patchDeck,
  asRegenType,
  cardHasRegenSource,
  regenCard,
  resetCardSchedule,
  type CardDraftView,
  type Deck,
  type DeckStats,
  type JobListItem,
  type MaterialListItem,
  type StoredCoverRow,
  type Subject,
  type SubjectKnowledge,
} from "../api/client";
import { cardPatchBody } from "../cards/cardPatchBody";
import DraftCardEditor, {
  type DraftEditorChange,
} from "../components/DraftCardEditor";
import { isGuest } from "../guest/session";
import { collectDeckImageKeys, hubDiyTypes } from "../lib/hubDiyCreate";
import { navigate } from "../nav/navigate";
import {
  formatExportWarnings,
  ANKI_EXPORT_BUSY_LABEL,
  runAnkiExportDownload,
} from "../export/runAnkiExport";
import { useTrackedOp } from "../progress/useTrackedOp";

type Props = {
  deckId: string;
};

export default function DeckHubPage({ deckId }: Props) {
  const guest = isGuest();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [cards, setCards] = useState<CardDraftView[]>([]);
  /** Accepted (non-archived) count — independent of Show archived filter. */
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [composition, setComposition] = useState<SubjectKnowledge | null>(null);
  const [draftJobs, setDraftJobs] = useState<JobListItem[]>([]);
  const [materials, setMaterials] = useState<MaterialListItem[]>([]);
  const [deckCover, setDeckCover] = useState<StoredCoverRow | null>(null);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
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
  const [moveAsBatch, setMoveAsBatch] = useState(false);
  const [moveSubjects, setMoveSubjects] = useState<Subject[]>([]);
  const [moveDecks, setMoveDecks] = useState<Deck[]>([]);
  const [moveSubjectId, setMoveSubjectId] = useState("");
  const [moveDeckId, setMoveDeckId] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const [workshopStack, setWorkshopStack] = useState<WorkshopFrame[]>([]);
  const [overflowAnchor, setOverflowAnchor] = useState<null | HTMLElement>(
    null,
  );

  const deckImageKeys = useMemo(() => collectDeckImageKeys(cards), [cards]);

  const cardsWorkshop = useCardsWorkshop({
    setCards,
    setAcceptedCount,
    setError,
    setNotice,
    editCard,
    setEditCard,
  });
  const {
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
  } = cardsWorkshop;

  const create = useCreateCardController({
    deckId,
    guest,
    showArchived,
    setCards,
    setAcceptedCount,
    setNotice,
    setWorkshopStack,
  });

  const { end: endLoad } = useTrackedOp("Loading deck…", {
    trackOnMount: true,
  });
  const { busy: exportBusy, run: runExport } = useTrackedOp(
    ANKI_EXPORT_BUSY_LABEL,
  );

  const refreshComposition = useCallback(async () => {
    try {
      setComposition(await getDeckComposition(deckId));
    } catch {
      setComposition(null);
    }
  }, [deckId]);

  const refreshCards = useCallback(async () => {
    const next = await listDeckCards(
      deckId,
      showArchived ? { status: "archived" } : undefined,
    );
    setCards(next);
    if (!showArchived) {
      setAcceptedCount(next.length);
    } else {
      const accepted = await listDeckCards(deckId);
      setAcceptedCount(accepted.length);
    }
    await refreshComposition();
  }, [deckId, refreshComposition, showArchived]);

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

  const material = useAddMaterialWorkshop({
    deckId,
    refreshCards,
    refreshDraftJobs,
    refreshMaterials,
    setWorkshopStack,
    prepareOcclusionFromImageKey: create.prepareOcclusionFromImageKey,
  });

  const study = useStudyReadySheet();

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
      await Promise.all([
        refreshDraftJobs(),
        refreshMaterials(),
        refreshDeckCover(),
        refreshComposition(),
      ]);
    } else {
      setComposition(null);
    }
    return found;
  }, [
    deckId,
    refreshComposition,
    refreshDeckCover,
    refreshDraftJobs,
    refreshMaterials,
  ]);

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
    let cancelled = false;
    (async () => {
      try {
        const next = await listDeckCards(
          deckId,
          showArchived ? { status: "archived" } : undefined,
        );
        if (cancelled) return;
        setCards(next);
        if (!showArchived) {
          setAcceptedCount(next.length);
        } else {
          try {
            const accepted = await listDeckCards(deckId);
            if (!cancelled) setAcceptedCount(accepted.length);
          } catch {
            if (!cancelled) setAcceptedCount(0);
          }
        }
        try {
          const nextComposition = await getDeckComposition(deckId);
          if (!cancelled) setComposition(nextComposition);
        } catch {
          if (!cancelled) setComposition(null);
        }
      } catch {
        if (!cancelled) setCards([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deck, deckId, ready, showArchived]);

  const topWorkshop = workshopStack[workshopStack.length - 1] ?? null;

  function openWorkshop(id: MissionTileId) {
    const frame: WorkshopFrame =
      id === "addMaterial"
        ? { id: "addMaterial", tab: material.materialTab }
        : { id };
    setWorkshopStack([frame]);
    if (id === "addMaterial") {
      material.resetMaterialMessages();
    }
    if (id === "study" && deck) {
      study.loadStudySummary(deck.id, acceptedCount);
    }
    if (id === "cards") {
      clearSelection();
    }
  }

  function onWorkshopBack() {
    setWorkshopStack((prev) => popWorkshop(prev));
  }

  function jumpWorkshop(frame: WorkshopFrame) {
    setWorkshopStack((prev) => replaceWorkshop(prev, frame));
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

  async function confirmMoveCard() {
    if (!moveTarget || !moveDeckId) return;
    setMoveBusy(true);
    setMoveError(null);
    try {
      const batchIds =
        moveAsBatch && selectedCardIds.size > 0
          ? [...selectedCardIds]
          : [moveTarget.id];
      for (const id of batchIds) {
        await moveCard(id, moveDeckId);
      }
      const moved = new Set(batchIds);
      setCards((prev) => prev.filter((c) => !moved.has(c.id)));
      if (!showArchived) {
        setAcceptedCount((n) => Math.max(0, n - batchIds.length));
      }
      if (editCard && moved.has(editCard.id)) {
        setEditCard(null);
      }
      setSelectedCardIds(new Set());
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

  async function onBatchMoveOpen() {
    if (selectedCardIds.size === 0) return;
    const first = cards.find((c) => selectedCardIds.has(c.id));
    if (!first) return;
    await openMove(first, { batch: true });
  }

  async function onExportAnki() {
    if (!deck || guest) return;
    setError(null);
    setExportWarning(null);
    try {
      await runExport(async () => {
        const warnings = await runAnkiExportDownload(
          () => createDeckExport(deck.id),
          apkgFilenameForDeckTitle(deck.title),
        );
        const warningText = formatExportWarnings(warnings);
        if (warningText) {
          setExportWarning(warningText);
        } else {
          setNotice("Anki deck downloaded");
        }
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    }
  }

  const workshopTitle =
    topWorkshop?.id === "addMaterial"
      ? "Add material"
      : topWorkshop?.id === "drafts"
        ? "Review drafts"
        : topWorkshop?.id === "cards"
          ? "Browse cards"
          : topWorkshop?.id === "createCard"
            ? "Create card"
            : topWorkshop?.id === "study"
              ? "Study ready"
              : "";

  const workshopOpen = workshopStack.length > 0;

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 5 } }}>
      {!ready ? (
        <Typography color="text.secondary">Loading deck…</Typography>
      ) : (
        <Stack spacing={3}>
          {deck ? (
            <DeckHubTitleHeader
              title={deck.title}
              cover={deckCover}
              guest={guest}
              metaLine={`${
                acceptedCount === 0
                  ? "No accepted cards yet"
                  : acceptedCount === 1
                    ? "1 accepted card"
                    : `${acceptedCount} accepted cards`
              }${
                draftJobs.length > 0
                  ? ` · ${draftJobs.length} draft job${draftJobs.length === 1 ? "" : "s"}`
                  : ""
              }`}
              spark={
                composition != null && composition.total > 0 ? (
                  <CompositionSpark
                    new={composition.new}
                    learning={composition.learning}
                    young={composition.young}
                    mature={composition.mature}
                    total={composition.total}
                  />
                ) : null
              }
              exportBusy={exportBusy}
              exportDisabled={acceptedCount === 0}
              overflowAnchor={overflowAnchor}
              onOverflowOpen={setOverflowAnchor}
              onOverflowClose={() => setOverflowAnchor(null)}
              onExportAnki={() => {
                void onExportAnki();
              }}
              onRename={() => {
                setRenameError(null);
                setRenameValue(deck.title);
                setRenameOpen(true);
              }}
              onDelete={openDelete}
              onChangeCover={() => setCoverPickerOpen(true)}
            />
          ) : (
            <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
              Deck
            </Typography>
          )}

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
            <MissionBoard
              draftCount={draftJobs.length}
              cardCount={acceptedCount}
              acceptedCount={acceptedCount}
              emptyDeck={acceptedCount === 0 && draftJobs.length === 0}
              onOpen={openWorkshop}
            />
          ) : null}
        </Stack>
      )}

      <WorkshopShell
        open={workshopOpen}
        title={workshopTitle}
        closeMode={workshopStack.length <= 1}
        onBack={onWorkshopBack}
      >
        {topWorkshop?.id === "addMaterial" ? (
          <AddMaterialWorkshop
            guest={guest}
            tab={topWorkshop.tab ?? material.materialTab}
            onTabChange={material.onTabChange}
            materialError={material.materialError}
            materialNotice={material.materialNotice}
            materialBusy={material.materialBusy}
            readingScan={material.readingScan}
            pasteText={material.pasteText}
            onPasteTextChange={material.setPasteText}
            pasteFilename={material.pasteFilename}
            onPasteFilenameChange={material.setPasteFilename}
            onGuestPaste={material.onGuestPaste}
            onAccountPaste={material.onAccountPaste}
            uploadFile={material.uploadFile}
            onUploadFileChange={material.setUploadFile}
            figureFiles={material.figureFiles}
            onFigureFilesChange={material.setFigureFiles}
            onUploadFile={material.onUploadFile}
            pdfSplitOpen={material.pdfSplitOpen}
            pdfSplitProgress={material.pdfSplitProgress}
            onPdfSplitConfirm={() => {
              void material.onPdfSplitConfirm();
            }}
            onPdfSplitCancel={material.onPdfSplitCancel}
            pdfCompressOpen={material.pdfCompressOpen}
            pdfCompressProgress={material.pdfCompressProgress}
            onPdfCompressConfirm={() => {
              void material.onPdfCompressConfirm();
            }}
            onPdfCompressCancel={material.onPdfCompressCancel}
            topicValue={material.topicValue}
            onTopicValueChange={material.setTopicValue}
            topicBusy={material.topicBusy}
            topicError={material.topicError}
            onTopicGenerate={material.onTopicGenerate}
            createCard={create.createCard}
            createBusy={create.createBusy}
            createImageBusy={create.createImageBusy}
            createError={create.createError}
            createNeedsImage={create.createNeedsImage}
            createImageKey={create.createImageKey}
            deckImageKeys={deckImageKeys}
            createImageInputRef={create.createImageInputRef}
            onCreateChange={create.onCreateChange}
            onCreateCard={create.onCreateCard}
            onCreateImageUpload={create.onCreateImageUpload}
            applyCreateImageKey={create.applyCreateImageKey}
            hubDiyAllowedTypes={create.hubDiyAllowedTypes}
            materials={materials}
            onMaterialsChanged={() => {
              void Promise.all([
                refreshMaterials(),
                refreshDraftJobs(),
                refreshCards(),
              ]);
            }}
            onCreateOcclusion={(mat) => {
              material.openDiyOcclusion(mat.r2_key ?? "");
            }}
            draftCount={draftJobs.length}
            onReviewDrafts={() => jumpWorkshop({ id: "drafts" })}
          />
        ) : null}

        {topWorkshop?.id === "drafts" ? (
          <DraftsWorkshop
            guest={guest}
            draftJobs={draftJobs}
            onAddMoreMaterial={() =>
              jumpWorkshop({ id: "addMaterial", tab: "upload" })
            }
            onDraftsChanged={async () => {
              await Promise.all([refreshDraftJobs(), refreshCards()]);
            }}
          />
        ) : null}

        {topWorkshop?.id === "study" && deck ? (
          <StudyReadySheet
            deckId={deck.id}
            acceptedCount={acceptedCount}
            summary={study.studySummary}
            loading={study.studySummaryLoading}
            error={study.studySummaryError}
          />
        ) : null}

        {topWorkshop?.id === "cards" ? (
          <CardsWorkshop
            mode="list"
            cards={cards}
            showArchived={showArchived}
            onShowArchivedChange={setShowArchived}
            selectedIds={selectedCardIds}
            onToggleSelect={onToggleSelect}
            onSelectAll={() => onSelectAll(cards)}
            onClearSelection={clearSelection}
            archiveBusyId={archiveBusyId}
            batchBusy={batchBusy}
            onBatchArchive={() => {
              void onBatchArchive();
            }}
            onBatchMove={() => {
              void onBatchMoveOpen();
            }}
            onEdit={openEdit}
            onMove={(card) => {
              void openMove(card);
            }}
            onArchive={(card) => {
              void onArchiveCard(card);
            }}
            onRestore={(card) => {
              void onRestoreCard(card);
            }}
            onCreateCard={() => {
              create.prepareCreateFrame();
              setWorkshopStack((prev) =>
                pushWorkshop(prev, { id: "createCard" }),
              );
            }}
          />
        ) : null}

        {topWorkshop?.id === "createCard" ? (
          <CardsWorkshop
            mode="create"
            createCard={create.createCard}
            createBusy={create.createBusy}
            createImageBusy={create.createImageBusy}
            createError={create.createError}
            createNeedsImage={create.createNeedsImage}
            createImageKey={create.createImageKey}
            deckImageKeys={deckImageKeys}
            createImageInputRef={create.createImageInputRef}
            hubDiyAllowedTypes={create.hubDiyAllowedTypes}
            onCreateChange={create.onCreateChange}
            onCreateSubmit={create.onCreateCard}
            onCreateImageUpload={create.onCreateImageUpload}
            applyCreateImageKey={create.applyCreateImageKey}
          />
        ) : null}
      </WorkshopShell>

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
                allowedTypes={hubDiyTypes(guest)}
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
        <DialogTitle>
          {moveAsBatch && selectedCardIds.size > 1
            ? `Move ${selectedCardIds.size} cards`
            : "Move card"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {moveAsBatch && selectedCardIds.size > 1
              ? "Choose a subject and deck. Selected cards leave this deck; study schedules stay the same."
              : "Choose a subject and deck. The card leaves this deck; its study schedule stays the same."}
          </DialogContentText>
          {moveError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {moveError}
            </Alert>
          ) : null}
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl
              fullWidth
              disabled={moveBusy || moveSubjects.length === 0}
            >
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
          <Button
            onClick={() => {
              setMoveTarget(null);
              setMoveAsBatch(false);
            }}
            disabled={moveBusy}
          >
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

      {!guest && deck ? (
        <CoverPickerDialog
          key={deck.id}
          open={coverPickerOpen}
          title={deck.title}
          ownerKind="deck"
          ownerId={deck.id}
          onClose={() => setCoverPickerOpen(false)}
          onSaved={(row) => {
            setDeckCover(row);
            setCoverPickerOpen(false);
          }}
          onClear={async () => {
            await clearCover("deck", deck.id);
            setDeckCover(null);
            setCoverPickerOpen(false);
          }}
        />
      ) : null}
    </Container>
  );
}
