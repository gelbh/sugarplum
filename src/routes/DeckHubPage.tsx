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
import DialogEyebrow from "../shared/ui/DialogEyebrow";
import { AddMaterialWorkshop } from "../deckHub";
import {
  CompositionSpark,
  PdfCompressConsent,
  PdfSplitConsent,
  PptxSplitConsent,
  diyOcclusionNotice,
  freePathImageHelperText,
  isImageUploadContentType,
  shouldOfferLearningObjectives,
  uploadSubmitDisabled,
  uploadSubmitLabel,
  runConsentedPdfCompressUpload,
  runConsentedPdfSplitUpload,
  runConsentedPptxSplitUpload,
  fileSizeCapMb,
} from "../materials";
import { CoverPickerDialog } from "../deckHub";
import { useShellBackOverride } from "../app/shell/ShellBackOverride";
import { CardsWorkshop } from "../deckHub";
import { ClaimCoverageFilmstrip, type ClaimJumpTarget } from "../deckHub";
import { DeckHygienePanel } from "../deckHub";
import { createDeckHubWorkshopOpeners } from "../deckHub";
import { DeckHubDeleteMaterialDialog } from "../deckHub";
import { DeckHubDraftPickerDialog } from "../deckHub";
import { DeckHubResetScheduleDialog } from "../deckHub";
import { DeckHubTitleHeader } from "../deckHub";
import { MaterialsWorkshop } from "../deckHub";
import { MissionBoard } from "../deckHub";
import { StudyReadySheet } from "../deckHub";
import { WorkshopShell } from "../deckHub";
import { type WorkshopFrame } from "../deckHub";
import {
  DIALOG_CANCEL_SX,
  DIALOG_PAPER_SX,
  DIALOG_TITLE_SX,
  GHOST_PILL_SX,
  PRIMARY_PILL_SX,
} from "../deckHub";
import { navigate } from "../shared/nav/navigate";
import { useCreateCardController } from "../deckHub";
import { useAddMaterialWorkshop } from "../deckHub";
import { useCardsWorkshop } from "../deckHub";
import { useDeckHubCardMutations } from "../deckHub";
import { useDeckHubDeckLifecycle } from "../deckHub";
import { useDeckHubDraftPicker } from "../deckHub";
import { useDeckHubExport } from "../deckHub";
import { useDeckHubLoad } from "../deckHub";
import { useDeckHubMaterialDelete } from "../deckHub";
import { useDeckHubWorkshopNav } from "../deckHub";
import { useStudyReadySheet } from "../deckHub";
import "../deckHub/motion";
import {
  asRegenType,
  cardHasRegenSource,
  listDeckCards,
  type CardDraftView,
  type ClaimCoverage,
  type Deck,
  type JobListItem,
  type MaterialListItem,
  type Subject,
  type SubjectKnowledge,
} from "../api/client";
import { DraftCardEditor } from "../draftReview";
import { isGuest } from "../guest/session";
import { collectDeckImageKeys, hubDiyTypes } from "../deckHub";
import { ANKI_EXPORT_BUSY_LABEL } from "../export";
import { useTrackedOp } from "../progress/useTrackedOp";
import { shouldAutoFocusText } from "../shared/lib/autoFocusText";

type Props = {
  deckId: string;
};

export default function DeckHubPage({ deckId }: Props) {
  const guest = isGuest();
  const { setHref: setShellBack, setHandler: setShellBackHandler } =
    useShellBackOverride();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [cards, setCards] = useState<CardDraftView[]>([]);
  /** Accepted (non-archived) count — independent of Show archived filter. */
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [composition, setComposition] = useState<SubjectKnowledge | null>(null);
  const [claimCoverage, setClaimCoverage] = useState<ClaimCoverage | null>(
    null,
  );
  const [draftJobs, setDraftJobs] = useState<JobListItem[]>([]);
  const [materials, setMaterials] = useState<MaterialListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportWarning, setExportWarning] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  /** Stack stays on page so create/material can take setWorkshopStack before nav Args exist. */
  const [workshopStack, setWorkshopStack] = useState<WorkshopFrame[]>([]);

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
    pruneSelection,
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

  const { refreshCards, refreshDraftJobs, refreshMaterials } = useDeckHubLoad({
    deckId,
    guest,
    showArchived,
    ready,
    deck,
    endLoad,
    refreshDeckCover,
    setDeck,
    setSubject,
    setCards,
    setAcceptedCount,
    setComposition,
    setClaimCoverage,
    setDraftJobs,
    setMaterials,
    setError,
    setReady,
  });

  const {
    deleteMaterialTarget,
    setDeleteMaterialTarget,
    deleteMaterialBusy,
    confirmDeleteMaterial,
  } = useDeckHubMaterialDelete({
    refreshMaterials,
    refreshDraftJobs,
    setError,
    setNotice,
  });

  const material = useAddMaterialWorkshop({
    deckId,
    refreshCards,
    refreshDraftJobs,
    refreshMaterials,
    setWorkshopStack,
    prepareOcclusionFromImageKey: create.prepareOcclusionFromImageKey,
    learningObjectives: {
      diyOcclusionNotice,
      freePathImageHelperText,
      isImageUploadContentType,
      shouldOfferLearningObjectives,
      uploadSubmitDisabled,
      uploadSubmitLabel,
    },
    consentedUploads: {
      runConsentedPdfCompressUpload: runConsentedPdfCompressUpload as never,
      runConsentedPdfSplitUpload: runConsentedPdfSplitUpload as never,
      runConsentedPptxSplitUpload: runConsentedPptxSplitUpload as never,
    },
  });

  const study = useStudyReadySheet();

  const {
    draftPickerOpen,
    setDraftPickerOpen,
    openFullDraftReview,
    openDraftJob,
  } = useDeckHubDraftPicker({ draftJobs });

  const {
    topWorkshop,
    workshopTitle,
    workshopOpen,
    creatingFlashcards,
    openWorkshop,
    onWorkshopBack,
  } = useDeckHubWorkshopNav({
    workshopStack,
    setWorkshopStack,
    resetMaterialMessages: material.resetMaterialMessages,
    loadStudySummary: study.loadStudySummary,
    clearSelection,
    refreshMaterials,
    onOpenDrafts: openFullDraftReview,
    deck,
    acceptedCount,
  });

  // Method steps: TopChrome Back matches footer Back (chooser / leave stack).
  useEffect(() => {
    if (!creatingFlashcards || topWorkshop?.tab == null) {
      setShellBackHandler(null);
      return;
    }
    const returnToChooser = workshopStack.length <= 1;
    const onTabChange = material.onTabChange;
    setShellBackHandler(() => {
      if (returnToChooser) onTabChange(null);
      else onWorkshopBack();
    });
    return () => setShellBackHandler(null);
  }, [
    creatingFlashcards,
    material.onTabChange,
    onWorkshopBack,
    setShellBackHandler,
    topWorkshop?.tab,
    workshopStack.length,
  ]);

  const onJumpToClaimCard = useCallback(
    (target: ClaimJumpTarget) => {
      void (async () => {
        if (target.cardStatus === "draft" && target.jobId) {
          navigate(`/jobs/${encodeURIComponent(target.jobId)}/drafts`);
          return;
        }
        if (target.cardStatus !== "accepted") return;
        let card = cards.find((c) => c.id === target.cardId);
        if (!card && showArchived) {
          onShowArchivedChange(false);
          try {
            const accepted = await listDeckCards(deckId);
            setCards(accepted);
            setAcceptedCount(accepted.length);
            card = accepted.find((c) => c.id === target.cardId);
          } catch {
            return;
          }
        }
        if (!card) return;
        openWorkshop("cards");
        openEdit(card);
      })();
    },
    [
      cards,
      deckId,
      onShowArchivedChange,
      openEdit,
      openWorkshop,
      setAcceptedCount,
      setCards,
      showArchived,
    ],
  );

  const { onExportAnki } = useDeckHubExport({
    guest,
    deck,
    setError,
    setNotice,
    setExportWarning,
    runExport,
  });

  const { openUploadFromMaterials, openDiyFromCards } =
    createDeckHubWorkshopOpeners({
      resetMaterialMessages: material.resetMaterialMessages,
      prepareCreateFrame: create.prepareCreateFrame,
      setWorkshopStack,
    });

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
      materialError={material.materialError}
      materialNotice={material.materialNotice}
      onClearMaterialMessages={material.resetMaterialMessages}
      materialBusy={material.materialBusy}
      readingScan={material.readingScan}
      pasteText={material.pasteText}
      onPasteTextChange={material.setPasteText}
      pasteFilename={material.pasteFilename}
      onPasteFilenameChange={material.setPasteFilename}
      alsoCover={material.alsoCover}
      onAlsoCoverChange={material.setAlsoCover}
      onGuestPaste={material.onGuestPaste}
      onAccountPaste={material.onAccountPaste}
      uploadFile={material.uploadFile}
      onUploadFileChange={material.setUploadFile}
      onFigureFilesChange={material.setFigureFiles}
      onUploadFile={material.onUploadFile}
      offerLearningObjectives={material.offerLearningObjectives}
      submitLabel={material.submitLabel}
      submitDisabled={material.submitDisabled}
      freePathImageHelper={material.freePathImageHelper}
      renderUploadConsents={() => (
        <>
          <PdfSplitConsent
            open={material.pdfSplitOpen}
            fileName={material.uploadFile?.name ?? "PDF"}
            figuresWillSkip={material.figureFiles.length > 0}
            progressLabel={material.pdfSplitProgress}
            busy={material.materialBusy}
            onConfirm={() => {
              void material.onPdfSplitConfirm();
            }}
            onCancel={material.onPdfSplitCancel}
          />
          <PptxSplitConsent
            open={material.pptxSplitOpen}
            fileName={material.uploadFile?.name ?? "PPTX"}
            maxMb={fileSizeCapMb()}
            progressLabel={material.pptxSplitProgress}
            busy={material.materialBusy}
            onConfirm={() => {
              void material.onPptxSplitConfirm();
            }}
            onCancel={material.onPptxSplitCancel}
          />
          <PdfCompressConsent
            open={material.pdfCompressOpen}
            fileName={material.uploadFile?.name ?? "PDF"}
            progressLabel={material.pdfCompressProgress}
            busy={material.materialBusy}
            onConfirm={() => {
              void material.onPdfCompressConfirm();
            }}
            onCancel={material.onPdfCompressCancel}
          />
        </>
      )}
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
        py: {
          xs: creatingFlashcards ? 1 : 2,
          md: 3,
        },
        display: "flex",
        flexDirection: "column",
        minHeight: { md: "100%" },
        flex: 1,
      }}
    >
      {!ready ? (
        <Typography
          sx={{
            color: "text.secondary",
          }}
        >
          Loading deck…
        </Typography>
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
                <>
                  {!isGuest() ? (
                    <DeckHygienePanel
                      deckId={deckId}
                      resolveCard={(id) =>
                        cards.find((card) => card.id === id) ?? null
                      }
                      onEdit={openEdit}
                      onChanged={() => {
                        void refreshCards();
                      }}
                    />
                  ) : null}
                  <CardsWorkshop
                    cards={cards}
                    showArchived={showArchived}
                    onShowArchivedChange={onShowArchivedChange}
                    selectedIds={selectedCardIds}
                    onToggleSelect={onToggleSelect}
                    onSelectAll={onSelectAll}
                    onClearSelection={clearSelection}
                    onPruneSelection={pruneSelection}
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
                </>
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
                      claimCoverage != null && claimCoverage.summary.total > 0
                        ? `${claimCoverage.summary.linked}/${claimCoverage.summary.total} claims`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    spark={
                      (composition != null && composition.total > 0) ||
                      (claimCoverage != null &&
                        claimCoverage.summary.total > 0) ? (
                        <Stack spacing={0} sx={{ alignItems: "flex-start" }}>
                          {composition != null && composition.total > 0 ? (
                            <CompositionSpark
                              new={composition.new}
                              learning={composition.learning}
                              young={composition.young}
                              mature={composition.mature}
                              total={composition.total}
                            />
                          ) : null}
                          <ClaimCoverageFilmstrip
                            coverage={claimCoverage}
                            onJumpToCard={onJumpToClaimCard}
                          />
                        </Stack>
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

      <DeckHubDraftPickerDialog
        open={draftPickerOpen}
        jobs={draftJobs}
        onClose={() => setDraftPickerOpen(false)}
        onPickJob={openDraftJob}
      />

      <Dialog
        open={renameOpen}
        onClose={() => !renameBusy && setRenameOpen(false)}
        fullWidth
        maxWidth="xs"
        slotProps={{
          paper: {
            sx: {
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "background.paper",
            },
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
            <DialogEyebrow label="Rename" />
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
              sx={{
                color: "text.secondary",
                mt: 1,
                maxWidth: "36ch",
              }}
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
              autoFocus={shouldAutoFocusText()}
              margin="none"
              label="Deck name"
              placeholder="e.g. Upper limb"
              value={renameValue}
              onChange={(ev) => setRenameValue(ev.target.value)}
              required
              fullWidth
              helperText={`${renameValue.trim().length}/80`}
              slotProps={{
                htmlInput: { maxLength: 80, "aria-label": "Deck name" },
                formHelperText: { sx: { textAlign: "right", mx: 0 } },
              }}
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
        slotProps={{
          paper: {
            sx: {
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "background.paper",
            },
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
          <DialogEyebrow label="Delete" tone="error" />
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
        slotProps={{
          paper: { sx: DIALOG_PAPER_SX },
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
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{
              flexWrap: "wrap",
            }}
          >
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
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
            }}
          >
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

      <DeckHubResetScheduleDialog
        open={confirmReset}
        busy={resetBusy}
        onClose={() => !resetBusy && setConfirmReset(false)}
        onConfirm={confirmResetSchedule}
      />
      <DeckHubDeleteMaterialDialog
        target={deleteMaterialTarget}
        busy={deleteMaterialBusy}
        onClose={() => !deleteMaterialBusy && setDeleteMaterialTarget(null)}
        onConfirm={() => {
          void confirmDeleteMaterial();
        }}
      />

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
