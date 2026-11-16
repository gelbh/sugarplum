import { useCallback, useEffect, useMemo, useState } from "react";
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
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import AddMaterialWorkshop from "../deckHub/AddMaterialWorkshop";
import CompositionSpark from "../components/CompositionSpark";
import CoverPickerDialog from "../components/CoverPickerDialog";
import { useShellBackOverride } from "../components/shell/ShellBackOverride";
import CardsWorkshop from "../deckHub/CardsWorkshop";
import DeckHubTitleHeader from "../deckHub/DeckHubTitleHeader";
import MaterialsWorkshop from "../deckHub/MaterialsWorkshop";
import MissionBoard, { type MissionTileId } from "../deckHub/MissionBoard";
import StudyReadySheet from "../deckHub/StudyReadySheet";
import WorkshopShell from "../deckHub/WorkshopShell";
import { popWorkshop, type WorkshopFrame } from "../deckHub/workshopStack";
import { navigate } from "../nav/navigate";
import { useCreateCardController } from "../deckHub/useCreateCardController";
import { useAddMaterialWorkshop } from "../deckHub/useAddMaterialWorkshop";
import { useCardsWorkshop } from "../deckHub/useCardsWorkshop";
import { useDeckHubCardMutations } from "../deckHub/useDeckHubCardMutations";
import { useDeckHubDeckLifecycle } from "../deckHub/useDeckHubDeckLifecycle";
import { useStudyReadySheet } from "../deckHub/useStudyReadySheet";
import {
  ApiError,
  apkgFilenameForDeckTitle,
  createDeckExport,
  deleteMaterial,
  getDeckComposition,
  listDeckCards,
  listDeckMaterials,
  listDecks,
  listJobsWithDrafts,
  listSubjects,
  asRegenType,
  cardHasRegenSource,
  type CardDraftView,
  type Deck,
  type JobListItem,
  type MaterialListItem,
  type Subject,
  type SubjectKnowledge,
} from "../api/client";
import DraftCardEditor from "../components/DraftCardEditor";
import { isGuest } from "../guest/session";
import { collectDeckImageKeys, hubDiyTypes } from "../lib/hubDiyCreate";
import {
  formatExportWarnings,
  ANKI_EXPORT_BUSY_LABEL,
  runAnkiExportDownload,
} from "../export/runAnkiExport";
import { useTrackedOp } from "../progress/useTrackedOp";

type Props = {
  deckId: string;
};

const DIALOG_PAPER_SX = {
  borderRadius: 2,
  overflow: "hidden",
  bgcolor: "background.paper",
} as const;

const DIALOG_TITLE_SX = {
  p: 0,
  fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
  fontWeight: 400,
  letterSpacing: "0.02em",
  lineHeight: 1.2,
  fontSize: "1.65rem",
} as const;

const DIALOG_CANCEL_SX = {
  color: "text.secondary",
  textTransform: "none",
  fontWeight: 500,
  "&:hover": { color: "text.primary", bgcolor: "transparent" },
} as const;

const PRIMARY_PILL_SX = {
  minWidth: 112,
  px: 2.25,
  py: 0.95,
  borderRadius: 999,
  textTransform: "none",
  fontWeight: 600,
  boxShadow: "none",
  "&:hover": { boxShadow: "none" },
} as const;

const GHOST_PILL_SX = {
  ...PRIMARY_PILL_SX,
  minWidth: 0,
  px: 1.5,
  border: "1px solid",
  borderColor: "rgba(232, 216, 199, 0.22)",
  color: "rgba(232, 216, 199, 0.82)",
  bgcolor: "transparent",
  "&:hover": {
    boxShadow: "none",
    borderColor: "rgba(232, 216, 199, 0.4)",
    bgcolor: "rgba(91, 44, 111, 0.18)",
  },
} as const;

function DialogEyebrow({
  label,
  tone = "primary",
}: {
  label: string;
  tone?: "primary" | "warning";
}) {
  return (
    <Typography
      component="p"
      sx={{
        m: 0,
        mb: 0.75,
        fontSize: "0.6875rem",
        fontWeight: 500,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: `${tone}.main`,
      }}
    >
      {label}
    </Typography>
  );
}

export default function DeckHubPage({ deckId }: Props) {
  const guest = isGuest();
  const { setHref: setShellBack } = useShellBackOverride();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [cards, setCards] = useState<CardDraftView[]>([]);
  /** Accepted (non-archived) count — independent of Show archived filter. */
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [composition, setComposition] = useState<SubjectKnowledge | null>(null);
  const [draftJobs, setDraftJobs] = useState<JobListItem[]>([]);
  const [materials, setMaterials] = useState<MaterialListItem[]>([]);
  const [deleteMaterialTarget, setDeleteMaterialTarget] =
    useState<MaterialListItem | null>(null);
  const [deleteMaterialBusy, setDeleteMaterialBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportWarning, setExportWarning] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [workshopStack, setWorkshopStack] = useState<WorkshopFrame[]>([]);
  const [draftPickerOpen, setDraftPickerOpen] = useState(false);

  const deckImageKeys = useMemo(() => collectDeckImageKeys(cards), [cards]);

  useEffect(() => {
    if (subject) {
      setShellBack(`/library/subjects/${encodeURIComponent(subject.id)}`);
    } else {
      setShellBack(null);
    }
    return () => setShellBack(null);
  }, [subject, setShellBack]);

  const {
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
  } = useDeckHubCardMutations({
    deckId,
    guest,
    subject,
    cards,
    setCards,
    setAcceptedCount,
    setNotice,
  });

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
    onShowArchivedChange,
    archiveBusyId,
    selectedCardIds,
    batchBusy,
    clearSelection,
    onToggleSelect,
    onSelectAll,
    onArchiveCard,
    onRestoreCard,
    onBatchArchive,
    onBatchRestore,
  } = cardsWorkshop;

  const create = useCreateCardController({
    deckId,
    guest,
    showArchived,
    setCards,
    setAcceptedCount,
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

  const {
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
  } = useDeckHubDeckLifecycle({
    deckId,
    guest,
    deck,
    setDeck,
    subject,
    setError,
  });

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

  function openFullDraftReview() {
    if (draftJobs.length === 0) return;
    if (draftJobs.length === 1) {
      navigate(`/jobs/${encodeURIComponent(draftJobs[0]!.id)}/drafts`);
      return;
    }
    setDraftPickerOpen(true);
  }

  function openDraftJob(jobId: string) {
    setDraftPickerOpen(false);
    navigate(`/jobs/${encodeURIComponent(jobId)}/drafts`);
  }

  function openWorkshop(id: MissionTileId) {
    if (id === "drafts") {
      openFullDraftReview();
      return;
    }
    const frame: WorkshopFrame =
      id === "addMaterial" ? { id: "addMaterial" } : { id };
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
    if (id === "materials") {
      void refreshMaterials();
    }
  }

  function openUploadFromMaterials() {
    material.resetMaterialMessages();
    setWorkshopStack([
      { id: "materials" },
      { id: "addMaterial", tab: "upload" },
    ]);
  }

  function openDiyFromCards() {
    create.prepareCreateFrame();
    material.resetMaterialMessages();
    setWorkshopStack([{ id: "cards" }, { id: "addMaterial", tab: "diy" }]);
  }

  async function confirmDeleteMaterial() {
    if (!deleteMaterialTarget || deleteMaterialBusy) return;
    setDeleteMaterialBusy(true);
    setError(null);
    try {
      await deleteMaterial(deleteMaterialTarget.id);
      setDeleteMaterialTarget(null);
      setNotice("File deleted");
      await Promise.all([refreshMaterials(), refreshDraftJobs()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete file");
    } finally {
      setDeleteMaterialBusy(false);
    }
  }

  function onWorkshopBack() {
    if (workshopStack[workshopStack.length - 1]?.id === "addMaterial") {
      material.resetMaterialMessages();
    }
    setWorkshopStack((prev) => popWorkshop(prev));
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
    topWorkshop?.id === "cards"
      ? "Browse cards"
      : topWorkshop?.id === "materials"
        ? "Browse files"
        : topWorkshop?.id === "study"
          ? "Study ready"
          : "";

  const creatingFlashcards = topWorkshop?.id === "addMaterial";
  const workshopOpen = workshopStack.length > 0 && !creatingFlashcards;

  const sortedMaterials = useMemo(
    () =>
      [...materials].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [materials],
  );

  const addMaterialWorkshop = creatingFlashcards ? (
    <AddMaterialWorkshop
      guest={guest}
      tab={topWorkshop.tab ?? null}
      onTabChange={material.onTabChange}
      onCancel={onWorkshopBack}
      returnToChooser={workshopStack.length <= 1}
      materialError={material.materialError}
      materialNotice={material.materialNotice}
      onClearMaterialMessages={material.resetMaterialMessages}
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
      pptxSplitOpen={material.pptxSplitOpen}
      pptxSplitProgress={material.pptxSplitProgress}
      onPptxSplitConfirm={() => {
        void material.onPptxSplitConfirm();
      }}
      onPptxSplitCancel={material.onPptxSplitCancel}
      pdfCompressOpen={material.pdfCompressOpen}
      pdfCompressProgress={material.pdfCompressProgress}
      onPdfCompressConfirm={() => {
        void material.onPdfCompressConfirm();
      }}
      onPdfCompressCancel={material.onPdfCompressCancel}
      createCard={create.createCard}
      createBusy={create.createBusy}
      createImageBusy={create.createImageBusy}
      createError={create.createError}
      createNotice={create.createNotice}
      createSessionHasCard={create.createSessionHasCard}
      createNeedsImage={create.createNeedsImage}
      createImageKey={create.createImageKey}
      deckImageKeys={deckImageKeys}
      createImageInputRef={create.createImageInputRef}
      onCreateChange={create.onCreateChange}
      onCreateCard={create.onCreateCard}
      onCreateImageUpload={create.onCreateImageUpload}
      applyCreateImageKey={create.applyCreateImageKey}
      clearCreateNotice={create.clearCreateNotice}
      hubDiyAllowedTypes={create.hubDiyAllowedTypes}
    />
  ) : null;

  return (
    <Container
      maxWidth={creatingFlashcards ? "lg" : "md"}
      sx={{
        py: { xs: 2, md: 3 },
        display: "flex",
        flexDirection: "column",
        minHeight: { md: "100%" },
        flex: 1,
      }}
    >
      {!ready ? (
        <Typography color="text.secondary">Loading deck…</Typography>
      ) : (
        <Stack
          spacing={creatingFlashcards || workshopOpen ? 0 : 2}
          sx={{ flex: 1, minHeight: 0 }}
        >
          {creatingFlashcards ? (
            <Box
              key="create-flashcards"
              sx={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                animation: "deckHubCreateIn 320ms cubic-bezier(0.2, 0, 0, 1)",
                "@keyframes deckHubCreateIn": {
                  from: { opacity: 0, transform: "translateX(40px)" },
                  to: { opacity: 1, transform: "translateX(0)" },
                },
                "@media (prefers-reduced-motion: reduce)": {
                  animation: "none",
                },
              }}
            >
              {addMaterialWorkshop}
            </Box>
          ) : workshopOpen ? (
            <WorkshopShell
              open
              title={workshopTitle}
              subtitle={
                topWorkshop?.id === "cards"
                  ? "Select, edit, move, or create cards in this deck."
                  : topWorkshop?.id === "materials"
                    ? "Download or remove files used to generate cards."
                    : topWorkshop?.id === "study"
                      ? "See what is due, then start a session."
                      : undefined
              }
              closeMode={workshopStack.length <= 1}
              onBack={onWorkshopBack}
            >
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
                  cards={cards}
                  showArchived={showArchived}
                  onShowArchivedChange={onShowArchivedChange}
                  selectedIds={selectedCardIds}
                  onToggleSelect={onToggleSelect}
                  onSelectAll={() => onSelectAll(cards)}
                  onClearSelection={clearSelection}
                  archiveBusyId={archiveBusyId}
                  batchBusy={batchBusy}
                  onBatchArchive={() => {
                    void onBatchArchive();
                  }}
                  onBatchRestore={() => {
                    void onBatchRestore();
                  }}
                  onBatchMove={() => {
                    void openBatchMove(selectedCardIds);
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
                  onCreateCard={openDiyFromCards}
                />
              ) : null}

              {topWorkshop?.id === "materials" ? (
                <MaterialsWorkshop
                  materials={sortedMaterials}
                  busyId={
                    deleteMaterialBusy
                      ? (deleteMaterialTarget?.id ?? null)
                      : null
                  }
                  guest={guest}
                  onUpload={openUploadFromMaterials}
                  onDelete={(row) => setDeleteMaterialTarget(row)}
                />
              ) : null}
            </WorkshopShell>
          ) : (
            <>
              <Box sx={{ flexShrink: 0 }}>
                {deck ? (
                  <DeckHubTitleHeader
                    title={deck.title}
                    cover={deckCover}
                    coverKey={deck.id}
                    guest={guest}
                    crumbs={[
                      { label: "Library", href: "/library" },
                      ...(subject
                        ? [
                            {
                              label: subject.title,
                              href: `/library/subjects/${encodeURIComponent(subject.id)}`,
                            },
                          ]
                        : []),
                    ]}
                    metaLine={[
                      acceptedCount > 0
                        ? acceptedCount === 1
                          ? "1 accepted card"
                          : `${acceptedCount} accepted cards`
                        : null,
                      draftJobs.length > 0
                        ? `${draftJobs.length} draft job${draftJobs.length === 1 ? "" : "s"}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
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
                    onExportAnki={() => {
                      void onExportAnki();
                    }}
                    onRename={openRename}
                    onDelete={openDelete}
                    onChangeCover={openCoverPicker}
                    onStudy={
                      acceptedCount > 0
                        ? () => openWorkshop("study")
                        : undefined
                    }
                  />
                ) : (
                  <Typography
                    variant="h3"
                    component="h1"
                    sx={{
                      m: 0,
                      fontFamily:
                        '"Alice", "Georgia", "Times New Roman", serif',
                      fontWeight: 400,
                      letterSpacing: "0.02em",
                      lineHeight: 1.1,
                    }}
                  >
                    Deck
                  </Typography>
                )}
              </Box>

              {error ? <Alert severity="error">{error}</Alert> : null}
              {notice ? (
                <Alert severity="success" onClose={() => setNotice(null)}>
                  {notice}
                </Alert>
              ) : null}
              {exportWarning ? (
                <Alert
                  severity="warning"
                  onClose={() => setExportWarning(null)}
                >
                  {exportWarning}
                </Alert>
              ) : null}

              {deck ? (
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                    animation:
                      "deckHubBoardIn 280ms cubic-bezier(0.2, 0, 0, 1)",
                    "@keyframes deckHubBoardIn": {
                      from: { opacity: 0, transform: "translateX(-24px)" },
                      to: { opacity: 1, transform: "translateX(0)" },
                    },
                    "@media (prefers-reduced-motion: reduce)": {
                      animation: "none",
                    },
                  }}
                >
                  <MissionBoard
                    draftCount={draftJobs.length}
                    cardCount={acceptedCount}
                    materialCount={materials.length}
                    emptyDeck={acceptedCount === 0 && draftJobs.length === 0}
                    onOpen={openWorkshop}
                  />
                </Box>
              ) : null}
            </>
          )}
        </Stack>
      )}

      <Dialog
        open={draftPickerOpen}
        onClose={() => setDraftPickerOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "background.paper",
          },
        }}
      >
        <DialogEyebrow label="Drafts" />
        <DialogTitle sx={DIALOG_TITLE_SX}>Choose a draft job</DialogTitle>
        <DialogContent sx={{ px: 3, pt: 1, pb: 1 }}>
          <Stack spacing={1}>
            {draftJobs.map((job) => (
              <Button
                key={job.id}
                variant="outlined"
                onClick={() => openDraftJob(job.id)}
                sx={{
                  justifyContent: "flex-start",
                  textTransform: "none",
                  borderRadius: 2,
                  py: 1.25,
                }}
              >
                <Stack
                  alignItems="flex-start"
                  spacing={0.25}
                  sx={{ minWidth: 0 }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {job.filename?.trim() || job.deck_title || "Draft job"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {job.draft_count} draft
                    {job.draft_count === 1 ? "" : "s"} ·{" "}
                    {new Date(job.created_at).toLocaleString()}
                  </Typography>
                </Stack>
              </Button>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDraftPickerOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={renameOpen}
        onClose={() => !renameBusy && setRenameOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "background.paper",
          },
        }}
      >
        <Box component="form" onSubmit={onRenameSubmit} noValidate>
          <Box
            sx={{
              px: 3,
              pt: 2.5,
              pb: 1.5,
              borderBottom: 1,
              borderColor: "divider",
              background:
                "linear-gradient(180deg, rgba(91, 44, 111, 0.12) 0%, transparent 100%)",
            }}
          >
            <Typography
              component="p"
              sx={{
                m: 0,
                mb: 0.75,
                fontSize: "0.6875rem",
                fontWeight: 500,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "primary.main",
              }}
            >
              Rename
            </Typography>
            <DialogTitle
              sx={{
                p: 0,
                fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
                fontWeight: 400,
                letterSpacing: "0.02em",
                lineHeight: 1.15,
                fontSize: "1.75rem",
              }}
            >
              Update the deck name
            </DialogTitle>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 1, maxWidth: "36ch" }}
            >
              Shown on the hub header and in your Library.
            </Typography>
          </Box>
          <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
            {renameError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {renameError}
              </Alert>
            ) : null}
            <TextField
              autoFocus
              margin="none"
              label="Deck name"
              placeholder="e.g. Upper limb"
              value={renameValue}
              onChange={(ev) => setRenameValue(ev.target.value)}
              required
              fullWidth
              inputProps={{ maxLength: 80, "aria-label": "Deck name" }}
              helperText={`${renameValue.trim().length}/80`}
              FormHelperTextProps={{ sx: { textAlign: "right", mx: 0 } }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
            <Button
              onClick={() => setRenameOpen(false)}
              disabled={renameBusy}
              sx={{ color: "text.secondary" }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={renameBusy || !renameValue.trim()}
              sx={{ minWidth: 112 }}
            >
              {renameBusy ? "Saving…" : "Save"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => !deleteBusy && setConfirmDelete(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "background.paper",
          },
        }}
      >
        <Box
          sx={{
            px: 3,
            pt: 2.5,
            pb: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            background:
              "linear-gradient(180deg, rgba(183, 28, 28, 0.1) 0%, transparent 100%)",
          }}
        >
          <Typography
            component="p"
            sx={{
              m: 0,
              mb: 0.75,
              fontSize: "0.6875rem",
              fontWeight: 500,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "error.main",
            }}
          >
            Delete
          </Typography>
          <DialogTitle
            sx={{
              p: 0,
              fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
              fontWeight: 400,
              letterSpacing: "0.02em",
              lineHeight: 1.15,
              fontSize: "1.75rem",
            }}
          >
            Remove this deck?
          </DialogTitle>
        </Box>
        <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
          <DialogContentText sx={{ color: "text.secondary" }}>
            {deck && deleteStats ? (
              <>
                Delete{" "}
                <Box component="strong" sx={{ color: "text.primary" }}>
                  {deck.title}
                </Box>
                ? This removes {deleteStats.accepted} accepted card
                {deleteStats.accepted === 1 ? "" : "s"}, {deleteStats.draft}{" "}
                draft{deleteStats.draft === 1 ? "" : "s"},{" "}
                {deleteStats.archived} archived card
                {deleteStats.archived === 1 ? "" : "s"}, and{" "}
                {deleteStats.materials} material
                {deleteStats.materials === 1 ? "" : "s"}.
              </>
            ) : deck ? (
              <>Loading counts for {deck.title}…</>
            ) : null}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setConfirmDelete(false)}
            disabled={deleteBusy}
            sx={{ color: "text.secondary" }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteBusy || !deleteStats}
            onClick={confirmDeleteDeck}
            sx={{ minWidth: 112 }}
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
        PaperProps={{ sx: DIALOG_PAPER_SX }}
      >
        <Box
          sx={{
            px: 3,
            pt: 2.5,
            pb: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            background:
              "linear-gradient(180deg, rgba(91, 44, 111, 0.14) 0%, transparent 100%)",
          }}
        >
          <DialogEyebrow label="Card" />
          <DialogTitle sx={DIALOG_TITLE_SX}>Edit card</DialogTitle>
        </Box>
        <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
          {editError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          ) : null}
          {editCard ? (
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
          ) : null}
        </DialogContent>
        <DialogActions
          sx={{
            px: 3,
            py: 2,
            gap: 1,
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button
              disabled={editDialogBusy || !editCard}
              startIcon={<DriveFileMoveOutlinedIcon sx={{ fontSize: 18 }} />}
              onClick={() => {
                if (editCard) void openMove(editCard);
              }}
              sx={GHOST_PILL_SX}
            >
              Move
            </Button>
            <Button
              disabled={editDialogBusy || !editCard}
              startIcon={<RestartAltRoundedIcon sx={{ fontSize: 18 }} />}
              onClick={() => setConfirmReset(true)}
              sx={{
                ...GHOST_PILL_SX,
                borderColor: "rgba(196, 165, 116, 0.35)",
                color: "var(--sp-grade-hard-fg, #e8d0a8)",
                "&:hover": {
                  boxShadow: "none",
                  borderColor: "rgba(196, 165, 116, 0.55)",
                  bgcolor: "rgba(196, 165, 116, 0.12)",
                },
              }}
            >
              Reset schedule
            </Button>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              onClick={() => setEditCard(null)}
              disabled={editDialogBusy}
              sx={DIALOG_CANCEL_SX}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={editDialogBusy || !editCard}
              onClick={saveEdit}
              sx={PRIMARY_PILL_SX}
            >
              {editBusy ? "Saving…" : "Save"}
            </Button>
          </Stack>
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
              void confirmMoveCard({
                selectedCardIds,
                showArchived,
                clearSelection,
              });
            }}
          >
            {moveBusy ? "Moving…" : "Move"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmReset}
        onClose={() => !resetBusy && setConfirmReset(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: DIALOG_PAPER_SX }}
      >
        <Box
          sx={{
            px: 3,
            pt: 2.5,
            pb: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            background:
              "linear-gradient(180deg, rgba(196, 165, 116, 0.12) 0%, transparent 100%)",
          }}
        >
          <DialogEyebrow label="Schedule" tone="warning" />
          <DialogTitle sx={DIALOG_TITLE_SX}>Reset schedule?</DialogTitle>
        </Box>
        <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
          <DialogContentText
            sx={{ color: "text.secondary", lineHeight: 1.55, m: 0 }}
          >
            This sets the card’s FSRS schedule back to a new card (due now).
            Your card text is unchanged.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setConfirmReset(false)}
            disabled={resetBusy}
            sx={DIALOG_CANCEL_SX}
          >
            Cancel
          </Button>
          <Button
            color="warning"
            variant="contained"
            disabled={resetBusy}
            onClick={confirmResetSchedule}
            sx={PRIMARY_PILL_SX}
          >
            {resetBusy ? "Resetting…" : "Reset schedule"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteMaterialTarget !== null}
        onClose={() => !deleteMaterialBusy && setDeleteMaterialTarget(null)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: DIALOG_PAPER_SX }}
      >
        <Box
          sx={{
            px: 3,
            pt: 2.5,
            pb: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            background:
              "linear-gradient(180deg, rgba(196, 165, 116, 0.12) 0%, transparent 100%)",
          }}
        >
          <DialogEyebrow label="Files" tone="warning" />
          <DialogTitle sx={DIALOG_TITLE_SX}>Delete file?</DialogTitle>
        </Box>
        <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
          <DialogContentText
            sx={{ color: "text.secondary", lineHeight: 1.55, m: 0 }}
          >
            {deleteMaterialTarget
              ? `Remove “${
                  deleteMaterialTarget.filename?.trim() || "this file"
                }” from the deck. Cards already created stay.`
              : null}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setDeleteMaterialTarget(null)}
            disabled={deleteMaterialBusy}
            sx={DIALOG_CANCEL_SX}
          >
            Cancel
          </Button>
          <Button
            color="warning"
            variant="contained"
            disabled={deleteMaterialBusy}
            onClick={() => {
              void confirmDeleteMaterial();
            }}
            sx={PRIMARY_PILL_SX}
          >
            {deleteMaterialBusy ? "Deleting…" : "Delete file"}
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
          onClose={closeCoverPicker}
          onSaved={onCoverSaved}
          onClear={onCoverClear}
        />
      ) : null}
    </Container>
  );
}
