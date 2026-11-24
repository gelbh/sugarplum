import CoverPickerDialog from "./CoverPickerDialog";
import DeckHubDeleteDialog from "./DeckHubDeleteDialog";
import DeckHubDeleteMaterialDialog from "./DeckHubDeleteMaterialDialog";
import DeckHubDraftPickerDialog from "./DeckHubDraftPickerDialog";
import DeckHubEditCardDialog from "./DeckHubEditCardDialog";
import DeckHubMoveCardDialog from "./DeckHubMoveCardDialog";
import DeckHubRenameDialog from "./DeckHubRenameDialog";
import DeckHubResetScheduleDialog from "./DeckHubResetScheduleDialog";
import type { DraftEditorChange } from "../draftReview";
import type {
  CardDraftView,
  Deck,
  JobListItem,
  MaterialListItem,
  StoredCoverRow,
  Subject,
} from "../api/client";

type DeleteStats = {
  accepted: number;
  draft: number;
  archived: number;
  materials: number;
};

export type DeckHubDialogsProps = {
  guest: boolean;
  deck: Deck | null;
  draftPicker: {
    open: boolean;
    jobs: JobListItem[];
    onClose: () => void;
    onPickJob: (jobId: string) => void;
  };
  rename: {
    open: boolean;
    busy: boolean;
    error: string | null;
    value: string;
    onValueChange: (value: string) => void;
    onClose: () => void;
    onSubmit: () => void;
  };
  deleteDeck: {
    open: boolean;
    busy: boolean;
    stats: DeleteStats | null;
    onClose: () => void;
    onConfirm: () => void;
  };
  edit: {
    card: CardDraftView | null;
    busy: boolean;
    saveBusy: boolean;
    error: string | null;
    cardRegenBusy: boolean;
    onClose: () => void;
    onChange: (next: DraftEditorChange) => void;
    onSave: () => void;
    onMove: () => void;
    onRequestReset: () => void;
    onRegen: () => void;
  };
  move: {
    open: boolean;
    batch: boolean;
    selectedCount: number;
    error: string | null;
    busy: boolean;
    subjects: Subject[];
    decks: Deck[];
    deckChoices: Deck[];
    subjectId: string;
    deckId: string;
    onSubjectChange: (subjectId: string) => void;
    onDeckChange: (deckId: string) => void;
    onClose: () => void;
    onConfirm: () => void;
  };
  resetSchedule: {
    open: boolean;
    busy: boolean;
    onClose: () => void;
    onConfirm: () => void;
  };
  deleteMaterial: {
    target: MaterialListItem | null;
    busy: boolean;
    onClose: () => void;
    onConfirm: () => void;
  };
  cover: {
    open: boolean;
    onClose: () => void;
    onSaved: (row: StoredCoverRow) => void;
    onClear: () => void;
  };
};

export default function DeckHubDialogs({
  guest,
  deck,
  draftPicker,
  rename,
  deleteDeck,
  edit,
  move,
  resetSchedule,
  deleteMaterial,
  cover,
}: DeckHubDialogsProps) {
  return (
    <>
      <DeckHubDraftPickerDialog
        open={draftPicker.open}
        jobs={draftPicker.jobs}
        onClose={draftPicker.onClose}
        onPickJob={draftPicker.onPickJob}
      />
      <DeckHubRenameDialog
        open={rename.open}
        busy={rename.busy}
        error={rename.error}
        value={rename.value}
        onValueChange={rename.onValueChange}
        onClose={rename.onClose}
        onSubmit={rename.onSubmit}
      />
      <DeckHubDeleteDialog
        open={deleteDeck.open}
        busy={deleteDeck.busy}
        title={deck?.title ?? null}
        stats={deleteDeck.stats}
        onClose={deleteDeck.onClose}
        onConfirm={deleteDeck.onConfirm}
      />
      <DeckHubEditCardDialog
        card={edit.card}
        busy={edit.busy}
        saveBusy={edit.saveBusy}
        error={edit.error}
        guest={guest}
        cardRegenBusy={edit.cardRegenBusy}
        onClose={edit.onClose}
        onChange={edit.onChange}
        onSave={edit.onSave}
        onMove={edit.onMove}
        onRequestReset={edit.onRequestReset}
        onRegen={edit.onRegen}
      />
      <DeckHubMoveCardDialog
        open={move.open}
        batch={move.batch}
        selectedCount={move.selectedCount}
        error={move.error}
        busy={move.busy}
        subjects={move.subjects}
        decks={move.decks}
        deckChoices={move.deckChoices}
        subjectId={move.subjectId}
        deckId={move.deckId}
        onSubjectChange={move.onSubjectChange}
        onDeckChange={move.onDeckChange}
        onClose={move.onClose}
        onConfirm={move.onConfirm}
      />
      <DeckHubResetScheduleDialog
        open={resetSchedule.open}
        busy={resetSchedule.busy}
        onClose={resetSchedule.onClose}
        onConfirm={resetSchedule.onConfirm}
      />
      <DeckHubDeleteMaterialDialog
        target={deleteMaterial.target}
        busy={deleteMaterial.busy}
        onClose={deleteMaterial.onClose}
        onConfirm={deleteMaterial.onConfirm}
      />
      {!guest && deck ? (
        <CoverPickerDialog
          key={deck.id}
          open={cover.open}
          title={deck.title}
          ownerKind="deck"
          ownerId={deck.id}
          onClose={cover.onClose}
          onSaved={cover.onSaved}
          onClear={cover.onClear}
        />
      ) : null}
    </>
  );
}
