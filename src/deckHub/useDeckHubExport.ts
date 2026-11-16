import type { Dispatch, SetStateAction } from "react";
import {
  ApiError,
  apkgFilenameForDeckTitle,
  createDeckExport,
  type Deck,
} from "../api/client";
import {
  formatExportWarnings,
  runAnkiExportDownload,
} from "../export/runAnkiExport";

type Args = {
  guest: boolean;
  deck: Deck | null;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setExportWarning: Dispatch<SetStateAction<string | null>>;
  runExport: (fn: () => Promise<void>) => Promise<unknown>;
};

export function useDeckHubExport({
  guest,
  deck,
  setError,
  setNotice,
  setExportWarning,
  runExport,
}: Args) {
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

  return { onExportAnki };
}
