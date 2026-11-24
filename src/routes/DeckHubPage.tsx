import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  CompositionSpark,
  diyOcclusionNotice,
  freePathImageHelperText,
  isImageUploadContentType,
  shouldOfferLearningObjectives,
  uploadSubmitDisabled,
  uploadSubmitLabel,
  runConsentedPdfCompressUpload,
  runConsentedPdfSplitUpload,
  runConsentedPptxSplitUpload,
} from "../materials";
import { CoverPickerDialog } from "../deckHub";
import { useShellBackOverride } from "../app/shell/ShellBackOverride";
import { CardsWorkshop } from "../deckHub";
import { ClaimCoverageFilmstrip, type ClaimJumpTarget } from "../deckHub";
import { DeckHygienePanel } from "../deckHub";
import { createDeckHubWorkshopOpeners } from "../deckHub";
import { DeckHubCreateView } from "../deckHub";
import { DeckHubDeleteDialog } from "../deckHub";
import { DeckHubDeleteMaterialDialog } from "../deckHub";
import { DeckHubDraftPickerDialog } from "../deckHub";
import { DeckHubEditCardDialog } from "../deckHub";
import { DeckHubMoveCardDialog } from "../deckHub";
import { DeckHubRenameDialog } from "../deckHub";
import { DeckHubResetScheduleDialog } from "../deckHub";
import { DeckHubTitleHeader } from "../deckHub";
import { MaterialsWorkshop } from "../deckHub";
import { MissionBoard } from "../deckHub";
import { StudyReadySheet } from "../deckHub";
import { WorkshopShell } from "../deckHub";
import { type WorkshopFrame } from "../deckHub";
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
  listDeckCards,
  type CardDraftView,
  type ClaimCoverage,
  type Deck,
  type JobListItem,
  type MaterialListItem,
  type Subject,
  type SubjectKnowledge,
} from "../api/client";
import { isGuest } from "../guest/session";
import { collectDeckImageKeys } from "../deckHub";
import { ANKI_EXPORT_BUSY_LABEL } from "../export";
import { useTrackedOp } from "../progress/useTrackedOp";

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
            <DeckHubCreateView
              guest={guest}
              tab={topWorkshop.tab ?? null}
              onTabChange={material.onTabChange}
              onCancel={onWorkshopBack}
              material={material}
              create={create}
              deckImageKeys={deckImageKeys}
            />
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

      <DeckHubRenameDialog
        open={renameOpen}
        busy={renameBusy}
        error={renameError}
        value={renameValue}
        onValueChange={setRenameValue}
        onClose={() => !renameBusy && setRenameOpen(false)}
        onSubmit={onRenameSubmit}
      />
      <DeckHubDeleteDialog
        open={confirmDelete}
        busy={deleteBusy}
        title={deck?.title ?? null}
        stats={deleteStats}
        onClose={() => !deleteBusy && setConfirmDelete(false)}
        onConfirm={confirmDeleteDeck}
      />

      <DeckHubEditCardDialog
        card={editCard}
        busy={editDialogBusy}
        saveBusy={editBusy}
        error={editError}
        guest={guest}
        cardRegenBusy={cardRegenBusy}
        onClose={() => !editDialogBusy && setEditCard(null)}
        onChange={onEditChange}
        onSave={saveEdit}
        onMove={() => {
          if (editCard) void openMove(editCard);
        }}
        onRequestReset={() => setConfirmReset(true)}
        onRegen={() => {
          void onRegenEditCard();
        }}
      />

      <DeckHubMoveCardDialog
        open={moveTarget !== null}
        batch={moveAsBatch}
        selectedCount={selectedCardIds.size}
        error={moveError}
        busy={moveBusy}
        subjects={moveSubjects}
        decks={moveDecks}
        deckChoices={moveDeckChoices}
        subjectId={moveSubjectId}
        deckId={moveDeckId}
        onSubjectChange={onMoveSubjectChange}
        onDeckChange={setMoveDeckId}
        onClose={() => {
          if (!moveBusy) {
            setMoveTarget(null);
            setMoveAsBatch(false);
          }
        }}
        onConfirm={() => {
          void confirmMoveCard({
            selectedCardIds,
            showArchived,
            clearSelection,
          });
        }}
      />

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
