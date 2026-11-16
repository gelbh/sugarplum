import { useState, type Dispatch, type SetStateAction } from "react";
import {
  ApiError,
  apkgFilenameForDeckTitle,
  createSelectionExport,
  type Deck,
} from "../api/client";
import {
  formatExportWarnings,
  runAnkiExportDownload,
} from "../export/runAnkiExport";

type Args = {
  guest: boolean;
  decks: Deck[];
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setExportWarning: Dispatch<SetStateAction<string | null>>;
  runExport: (fn: () => Promise<void>) => Promise<unknown>;
};

export function useLibrarySelectionExport({
  guest,
  decks,
  setError,
  setNotice,
  setExportWarning,
  runExport,
}: Args) {
  const [selectMode, setSelectMode] = useState(false);
  /** Selection is deck ids only; subject checkbox toggles all decks in that subject. */
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedDeckIds([]);
  }

  function toggleDeckSelected(deckId: string) {
    setSelectedDeckIds((prev) =>
      prev.includes(deckId)
        ? prev.filter((id) => id !== deckId)
        : [...prev, deckId],
    );
  }

  function toggleSubjectDecks(subjectId: string) {
    const childIds = decks
      .filter((d) => d.subject_id === subjectId)
      .map((d) => d.id);
    if (childIds.length === 0) return;
    setSelectedDeckIds((prev) => {
      const selected = new Set(prev);
      const allOn = childIds.every((id) => selected.has(id));
      if (allOn) {
        for (const id of childIds) selected.delete(id);
      } else {
        for (const id of childIds) selected.add(id);
      }
      return [...selected];
    });
  }

  async function onExportSelected() {
    if (guest) return;
    if (selectedDeckIds.length === 0) return;
    setError(null);
    setNotice(null);
    setExportWarning(null);
    try {
      await runExport(async () => {
        const warnings = await runAnkiExportDownload(
          () =>
            createSelectionExport({
              subjectIds: [],
              deckIds: selectedDeckIds,
            }),
          apkgFilenameForDeckTitle("Sugarplum export"),
        );
        const warningText = formatExportWarnings(warnings);
        if (warningText) {
          setExportWarning(warningText);
        } else {
          setNotice("Anki package downloaded");
        }
        exitSelectMode();
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    }
  }

  const selectedDeckIdSet = new Set(selectedDeckIds);
  const selectionCount = selectedDeckIds.length;
  const orphanDecks = decks.filter((d) => d.subject_id == null);

  return {
    selectMode,
    setSelectMode,
    selectedDeckIds,
    exitSelectMode,
    toggleDeckSelected,
    toggleSubjectDecks,
    onExportSelected,
    selectedDeckIdSet,
    selectionCount,
    orphanDecks,
  };
}
