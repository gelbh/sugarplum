import { useCallback, useEffect, useMemo, useState } from "react";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
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
import {
  DeckHubCreateView,
  deckHubCreateCardUi,
  deckHubCreateMaterialUi,
  DeckHubDialogs,
  DeckHubHubView,
  DeckHubWorkshopView,
  collectDeckImageKeys,
  createDeckHubWorkshopOpeners,
  useAddMaterialWorkshop,
  useCardsWorkshop,
  useCreateCardController,
  useDeckHubCardMutations,
  useDeckHubDeckLifecycle,
  useDeckHubDraftPicker,
  useDeckHubExport,
  useDeckHubLoad,
  useDeckHubMaterialDelete,
  useDeckHubWorkshopNav,
  useStudyReadySheet,
  type ClaimJumpTarget,
  type WorkshopFrame,
} from "../deckHub";
import { useShellBackOverride } from "../app/shell/ShellBackOverride";
import { navigate } from "../shared/nav/navigate";
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

  const cardMut = useDeckHubCardMutations({
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
    editCard: cardMut.editCard,
    setEditCard: cardMut.setEditCard,
  });

  const create = useCreateCardController({
    deckId,
    guest,
    showArchived: cardsWorkshop.showArchived,
    setCards,
    setAcceptedCount,
  });

  const { end: endLoad } = useTrackedOp("Loading deck…", {
    trackOnMount: true,
  });
  const { busy: exportBusy, run: runExport } = useTrackedOp(
    ANKI_EXPORT_BUSY_LABEL,
  );

  const life = useDeckHubDeckLifecycle({
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
    showArchived: cardsWorkshop.showArchived,
    ready,
    deck,
    endLoad,
    refreshDeckCover: life.refreshDeckCover,
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

  const materialDelete = useDeckHubMaterialDelete({
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
  const drafts = useDeckHubDraftPicker({ draftJobs });

  const nav = useDeckHubWorkshopNav({
    workshopStack,
    setWorkshopStack,
    resetMaterialMessages: material.resetMaterialMessages,
    loadStudySummary: study.loadStudySummary,
    clearSelection: cardsWorkshop.clearSelection,
    refreshMaterials,
    onOpenDrafts: drafts.openFullDraftReview,
    deck,
    acceptedCount,
  });

  // Method steps: TopChrome Back matches footer Back (chooser / leave stack).
  useEffect(() => {
    if (!nav.creatingFlashcards || nav.topWorkshop?.tab == null) {
      setShellBackHandler(null);
      return;
    }
    const returnToChooser = workshopStack.length <= 1;
    const onTabChange = material.onTabChange;
    setShellBackHandler(() => {
      if (returnToChooser) onTabChange(null);
      else nav.onWorkshopBack();
    });
    return () => setShellBackHandler(null);
  }, [
    material.onTabChange,
    nav.creatingFlashcards,
    nav.onWorkshopBack,
    nav.topWorkshop?.tab,
    setShellBackHandler,
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
        if (!card && cardsWorkshop.showArchived) {
          cardsWorkshop.onShowArchivedChange(false);
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
        nav.openWorkshop("cards");
        cardMut.openEdit(card);
      })();
    },
    [
      cardMut.openEdit,
      cards,
      cardsWorkshop.onShowArchivedChange,
      cardsWorkshop.showArchived,
      deckId,
      nav.openWorkshop,
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

  return (
    <Container
      maxWidth={nav.creatingFlashcards ? "lg" : "md"}
      sx={{
        py: {
          xs: nav.creatingFlashcards ? 1 : 2,
          md: 3,
        },
        display: "flex",
        flexDirection: "column",
        minHeight: { md: "100%" },
        flex: 1,
      }}
    >
      {!ready ? (
        <Typography sx={{ color: "text.secondary" }}>Loading deck…</Typography>
      ) : (
        <Stack
          spacing={nav.creatingFlashcards || nav.workshopOpen ? 0 : 2}
          sx={{ flex: 1, minHeight: 0 }}
        >
          {nav.creatingFlashcards ? (
            <DeckHubCreateView
              guest={guest}
              tab={nav.topWorkshop?.tab ?? null}
              onTabChange={material.onTabChange}
              onCancel={nav.onWorkshopBack}
              deckImageKeys={deckImageKeys}
              materialUi={deckHubCreateMaterialUi(material)}
              createUi={deckHubCreateCardUi(create)}
            />
          ) : nav.workshopOpen ? (
            <DeckHubWorkshopView
              title={nav.workshopTitle}
              closeMode={workshopStack.length <= 1}
              onBack={nav.onWorkshopBack}
              topId={nav.topWorkshop?.id}
              deckId={deckId}
              deck={deck}
              guest={guest}
              acceptedCount={acceptedCount}
              study={{
                summary: study.studySummary,
                loading: study.studySummaryLoading,
                error: study.studySummaryError,
              }}
              cards={cards}
              cardsUi={{
                showArchived: cardsWorkshop.showArchived,
                onShowArchivedChange: cardsWorkshop.onShowArchivedChange,
                selectedIds: cardsWorkshop.selectedCardIds,
                onToggleSelect: cardsWorkshop.onToggleSelect,
                onSelectAll: cardsWorkshop.onSelectAll,
                onClearSelection: cardsWorkshop.clearSelection,
                onPruneSelection: cardsWorkshop.pruneSelection,
                archiveBusyId: cardsWorkshop.archiveBusyId,
                batchBusy: cardsWorkshop.batchBusy,
                onBatchArchive: () => {
                  void cardsWorkshop.onBatchArchive();
                },
                onBatchRestore: () => {
                  void cardsWorkshop.onBatchRestore();
                },
                onBatchMove: () => {
                  void cardMut.openBatchMove(cardsWorkshop.selectedCardIds);
                },
                onEdit: cardMut.openEdit,
                onMove: (card) => {
                  void cardMut.openMove(card);
                },
                onArchive: (card) => {
                  void cardsWorkshop.onArchiveCard(card);
                },
                onRestore: (card) => {
                  void cardsWorkshop.onRestoreCard(card);
                },
                onCreateCard: openDiyFromCards,
                refreshCards,
              }}
              materials={{
                materials,
                deleteBusy: materialDelete.deleteMaterialBusy,
                deleteTarget: materialDelete.deleteMaterialTarget,
                onUpload: openUploadFromMaterials,
                onDelete: (row) =>
                  materialDelete.setDeleteMaterialTarget(row),
              }}
            />
          ) : (
            <DeckHubHubView
              deck={deck}
              subject={subject}
              cover={life.deckCover}
              guest={guest}
              acceptedCount={acceptedCount}
              draftJobCount={draftJobs.length}
              materialCount={materials.length}
              composition={composition}
              claimCoverage={claimCoverage}
              error={error}
              notice={notice}
              exportWarning={exportWarning}
              onClearNotice={() => setNotice(null)}
              onClearExportWarning={() => setExportWarning(null)}
              exportBusy={exportBusy}
              onExportAnki={() => {
                void onExportAnki();
              }}
              onRename={life.openRename}
              onDelete={life.openDelete}
              onChangeCover={life.openCoverPicker}
              onOpenWorkshop={nav.openWorkshop}
              onJumpToClaimCard={onJumpToClaimCard}
            />
          )}
        </Stack>
      )}

      <DeckHubDialogs
        guest={guest}
        deck={deck}
        draftPicker={{
          open: drafts.draftPickerOpen,
          jobs: draftJobs,
          onClose: () => drafts.setDraftPickerOpen(false),
          onPickJob: drafts.openDraftJob,
        }}
        rename={{
          open: life.renameOpen,
          busy: life.renameBusy,
          error: life.renameError,
          value: life.renameValue,
          onValueChange: life.setRenameValue,
          onClose: () => !life.renameBusy && life.setRenameOpen(false),
          onSubmit: life.onRenameSubmit,
        }}
        deleteDeck={{
          open: life.confirmDelete,
          busy: life.deleteBusy,
          stats: life.deleteStats,
          onClose: () => !life.deleteBusy && life.setConfirmDelete(false),
          onConfirm: life.confirmDeleteDeck,
        }}
        edit={{
          card: cardMut.editCard,
          busy: cardMut.editDialogBusy,
          saveBusy: cardMut.editBusy,
          error: cardMut.editError,
          cardRegenBusy: cardMut.cardRegenBusy,
          onClose: () =>
            !cardMut.editDialogBusy && cardMut.setEditCard(null),
          onChange: cardMut.onEditChange,
          onSave: cardMut.saveEdit,
          onMove: () => {
            if (cardMut.editCard) void cardMut.openMove(cardMut.editCard);
          },
          onRequestReset: () => cardMut.setConfirmReset(true),
          onRegen: () => {
            void cardMut.onRegenEditCard();
          },
        }}
        move={{
          open: cardMut.moveTarget !== null,
          batch: cardMut.moveAsBatch,
          selectedCount: cardsWorkshop.selectedCardIds.size,
          error: cardMut.moveError,
          busy: cardMut.moveBusy,
          subjects: cardMut.moveSubjects,
          decks: cardMut.moveDecks,
          deckChoices: cardMut.moveDeckChoices,
          subjectId: cardMut.moveSubjectId,
          deckId: cardMut.moveDeckId,
          onSubjectChange: cardMut.onMoveSubjectChange,
          onDeckChange: cardMut.setMoveDeckId,
          onClose: () => {
            if (!cardMut.moveBusy) {
              cardMut.setMoveTarget(null);
              cardMut.setMoveAsBatch(false);
            }
          },
          onConfirm: () => {
            void cardMut.confirmMoveCard({
              selectedCardIds: cardsWorkshop.selectedCardIds,
              showArchived: cardsWorkshop.showArchived,
              clearSelection: cardsWorkshop.clearSelection,
            });
          },
        }}
        resetSchedule={{
          open: cardMut.confirmReset,
          busy: cardMut.resetBusy,
          onClose: () =>
            !cardMut.resetBusy && cardMut.setConfirmReset(false),
          onConfirm: cardMut.confirmResetSchedule,
        }}
        deleteMaterial={{
          target: materialDelete.deleteMaterialTarget,
          busy: materialDelete.deleteMaterialBusy,
          onClose: () =>
            !materialDelete.deleteMaterialBusy &&
            materialDelete.setDeleteMaterialTarget(null),
          onConfirm: () => {
            void materialDelete.confirmDeleteMaterial();
          },
        }}
        cover={{
          open: life.coverPickerOpen,
          onClose: life.closeCoverPicker,
          onSaved: life.onCoverSaved,
          onClear: life.onCoverClear,
        }}
      />
    </Container>
  );
}
