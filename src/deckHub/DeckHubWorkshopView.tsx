import { useMemo } from "react";
import CardsWorkshop from "./CardsWorkshop";
import DeckHygienePanel from "./DeckHygienePanel";
import MaterialsWorkshop from "./MaterialsWorkshop";
import StudyReadySheet, { type StudyReadySummary } from "./StudyReadySheet";
import WorkshopShell from "./WorkshopShell";
import type { WorkshopId } from "./workshopStack";
import type {
  CardDraftView,
  Deck,
  MaterialListItem,
} from "../api/client";

function workshopSubtitle(topId: WorkshopId | undefined): string | undefined {
  if (topId === "cards") {
    return "Select, edit, move, or create cards in this deck.";
  }
  if (topId === "materials") {
    return "Download or remove files used to generate cards.";
  }
  if (topId === "study") {
    return "See what is due, then start a session.";
  }
  return undefined;
}

export type DeckHubWorkshopStudyProps = {
  summary: StudyReadySummary | null;
  loading: boolean;
  error: string | null;
};

export type DeckHubWorkshopCardsProps = {
  showArchived: boolean;
  onShowArchivedChange: (checked: boolean) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (cards: CardDraftView[]) => void;
  onClearSelection: () => void;
  onPruneSelection: (visibleIds: Iterable<string>) => void;
  archiveBusyId: string | null;
  batchBusy: boolean;
  onBatchArchive: () => void;
  onBatchRestore: () => void;
  onBatchMove: () => void;
  onEdit: (card: CardDraftView) => void;
  onMove: (card: CardDraftView) => void;
  onArchive: (card: CardDraftView) => void;
  onRestore: (card: CardDraftView) => void;
  onCreateCard: () => void;
  refreshCards: () => void | Promise<void>;
};

export type DeckHubWorkshopMaterialsProps = {
  materials: MaterialListItem[];
  deleteBusy: boolean;
  deleteTarget: MaterialListItem | null;
  onUpload: () => void;
  onDelete: (row: MaterialListItem) => void;
};

export type DeckHubWorkshopViewProps = {
  title: string;
  closeMode: boolean;
  onBack: () => void;
  topId: WorkshopId | undefined;
  deckId: string;
  deck: Deck | null;
  guest: boolean;
  acceptedCount: number;
  study: DeckHubWorkshopStudyProps;
  cards: CardDraftView[];
  cardsUi: DeckHubWorkshopCardsProps;
  materials: DeckHubWorkshopMaterialsProps;
};

export default function DeckHubWorkshopView({
  title,
  closeMode,
  onBack,
  topId,
  deckId,
  deck,
  guest,
  acceptedCount,
  study,
  cards,
  cardsUi,
  materials,
}: DeckHubWorkshopViewProps) {
  const sortedMaterials = useMemo(
    () =>
      [...materials.materials].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    [materials.materials],
  );

  return (
    <WorkshopShell
      open
      title={title}
      subtitle={workshopSubtitle(topId)}
      closeMode={closeMode}
      onBack={onBack}
    >
      {topId === "study" && deck ? (
        <StudyReadySheet
          deckId={deck.id}
          acceptedCount={acceptedCount}
          summary={study.summary}
          loading={study.loading}
          error={study.error}
        />
      ) : null}

      {topId === "cards" ? (
        <>
          {!guest ? (
            <DeckHygienePanel
              deckId={deckId}
              resolveCard={(id) =>
                cards.find((card) => card.id === id) ?? null
              }
              onEdit={cardsUi.onEdit}
              onChanged={() => {
                void cardsUi.refreshCards();
              }}
            />
          ) : null}
          <CardsWorkshop
            cards={cards}
            showArchived={cardsUi.showArchived}
            onShowArchivedChange={cardsUi.onShowArchivedChange}
            selectedIds={cardsUi.selectedIds}
            onToggleSelect={cardsUi.onToggleSelect}
            onSelectAll={cardsUi.onSelectAll}
            onClearSelection={cardsUi.onClearSelection}
            onPruneSelection={cardsUi.onPruneSelection}
            archiveBusyId={cardsUi.archiveBusyId}
            batchBusy={cardsUi.batchBusy}
            onBatchArchive={cardsUi.onBatchArchive}
            onBatchRestore={cardsUi.onBatchRestore}
            onBatchMove={cardsUi.onBatchMove}
            onEdit={cardsUi.onEdit}
            onMove={cardsUi.onMove}
            onArchive={cardsUi.onArchive}
            onRestore={cardsUi.onRestore}
            onCreateCard={cardsUi.onCreateCard}
          />
        </>
      ) : null}

      {topId === "materials" ? (
        <MaterialsWorkshop
          materials={sortedMaterials}
          busyId={
            materials.deleteBusy ? (materials.deleteTarget?.id ?? null) : null
          }
          guest={guest}
          onUpload={materials.onUpload}
          onDelete={materials.onDelete}
        />
      ) : null}
    </WorkshopShell>
  );
}
