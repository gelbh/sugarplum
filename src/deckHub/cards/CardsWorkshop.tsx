import { useState, useDeferredValue } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EmptyNext from "../workshop/EmptyNext";
import type { CardDraftView } from "../../api/client";
import CardPreviewDialog from "./CardPreviewDialog";
import {
  cardMatchesWorkshopQuery,
  normalizeWorkshopQuery,
} from "../workshop/workshopSearch";
import {
  WORKSHOP_SURFACE,
  createWorkshopViewPref,
  type WorkshopViewMode,
} from "../workshop/workshopChrome";
import CardsWorkshopBulkBar from "./CardsWorkshopBulkBar";
import CardsWorkshopIconGrid from "./CardsWorkshopIconGrid";
import CardsWorkshopList from "./CardsWorkshopList";
import CardsWorkshopToolbar from "./CardsWorkshopToolbar";

const { readViewMode, writeViewMode } = createWorkshopViewPref(
  "sugarplum.cardsWorkshop.view",
);

type ViewMode = WorkshopViewMode;

type Props = {
  cards: CardDraftView[];
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
};

export default function CardsWorkshop({
  cards,
  showArchived,
  onShowArchivedChange,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onPruneSelection,
  archiveBusyId,
  batchBusy,
  onBatchArchive,
  onBatchRestore,
  onBatchMove,
  onEdit,
  onMove,
  onArchive,
  onRestore,
  onCreateCard,
}: Props) {
  const [view, setView] = useState<ViewMode>(() => readViewMode());
  const [query, setQuery] = useState("");
  const [previewCard, setPreviewCard] = useState<CardDraftView | null>(null);
  const deferredQuery = useDeferredValue(query);
  const busy = archiveBusyId !== null || batchBusy;
  const selectedCount = selectedIds.size;
  const visible = cards.filter((c) =>
    cardMatchesWorkshopQuery(c, deferredQuery),
  );
  const searching = normalizeWorkshopQuery(deferredQuery) !== "";

  function handleQueryChange(next: string) {
    setQuery(next);
    onPruneSelection(
      cards
        .filter((card) => cardMatchesWorkshopQuery(card, next))
        .map((card) => card.id),
    );
  }

  const allSelected =
    visible.length > 0 && visible.every((card) => selectedIds.has(card.id));
  const someSelected =
    visible.some((card) => selectedIds.has(card.id)) && !allSelected;
  const cardCountLabel =
    cards.length === 0
      ? showArchived
        ? "No archived cards"
        : "No cards yet"
      : searching
        ? `${visible.length} of ${cards.length} cards`
        : cards.length === 1
          ? "1 card"
          : `${cards.length} cards`;

  function onViewChange(_: unknown, next: ViewMode | null) {
    if (!next) return;
    setView(next);
    writeViewMode(next);
  }

  return (
    <Stack spacing={1.75} sx={{ minHeight: 0 }}>
      <CardsWorkshopToolbar
        cardCountLabel={cardCountLabel}
        cardsLength={cards.length}
        query={query}
        onQueryChange={handleQueryChange}
        view={view}
        onViewChange={onViewChange}
        showArchived={showArchived}
        onShowArchivedChange={(checked) => {
          setQuery("");
          onShowArchivedChange(checked);
        }}
        busy={busy}
        onCreateCard={onCreateCard}
      />

      {cards.length === 0 ? (
        showArchived ? (
          <Box
            sx={{
              borderRadius: 2,
              border: "1px solid",
              borderColor: "rgba(232, 216, 199, 0.14)",
              bgcolor: "rgba(18, 7, 15, 0.28)",
              px: 2.25,
              py: 2.5,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              No archived cards in this deck.
            </Typography>
          </Box>
        ) : (
          <EmptyNext
            title="No accepted cards yet"
            body="Create a card yourself or add material to generate some."
            primary={{ label: "Create card", onClick: onCreateCard }}
          />
        )
      ) : (
        <>
          <CardsWorkshopBulkBar
            visible={visible}
            selectedCount={selectedCount}
            allSelected={allSelected}
            someSelected={someSelected}
            showArchived={showArchived}
            busy={busy}
            onSelectAll={onSelectAll}
            onClearSelection={onClearSelection}
            onBatchArchive={onBatchArchive}
            onBatchRestore={onBatchRestore}
            onBatchMove={onBatchMove}
          />

          {searching && visible.length === 0 ? (
            <Box
              id="cards-workshop-results"
              sx={{
                ...WORKSHOP_SURFACE,
                px: 2.25,
                py: 2.5,
              }}
            >
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {`No cards match "${deferredQuery.trim()}"`}
              </Typography>
            </Box>
          ) : view === "icons" ? (
            <CardsWorkshopIconGrid
              visible={visible}
              selectedIds={selectedIds}
              showArchived={showArchived}
              busy={busy}
              onToggleSelect={onToggleSelect}
              onPreview={setPreviewCard}
              onEdit={onEdit}
              onMove={onMove}
              onArchive={onArchive}
              onRestore={onRestore}
            />
          ) : (
            <CardsWorkshopList
              visible={visible}
              selectedIds={selectedIds}
              showArchived={showArchived}
              busy={busy}
              onToggleSelect={onToggleSelect}
              onPreview={setPreviewCard}
              onEdit={onEdit}
              onMove={onMove}
              onArchive={onArchive}
              onRestore={onRestore}
            />
          )}
        </>
      )}
      <CardPreviewDialog
        card={previewCard}
        busy={busy}
        onClose={() => setPreviewCard(null)}
        onEdit={onEdit}
      />
    </Stack>
  );
}
