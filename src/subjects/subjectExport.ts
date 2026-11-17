import type { Dispatch, SetStateAction } from "react";
import {
  ApiError,
  apkgFilenameForDeckTitle,
  createSubjectExport as createSubjectExportJob,
  type Subject,
} from "../api/client";
import {
  formatExportWarnings,
  runAnkiExportDownload,
} from "../export/runAnkiExport";

export type SubjectExportCtx = {
  subject: Subject | null;
  guest: boolean;
  runExport: <T>(fn: () => Promise<T>) => Promise<T>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setExportWarning: Dispatch<SetStateAction<string | null>>;
};

export function createSubjectExport(ctx: SubjectExportCtx) {
  const { subject, guest, runExport, setError, setNotice, setExportWarning } =
    ctx;

  async function onExportAnki() {
    if (!subject || guest) return;
    setError(null);
    setNotice(null);
    setExportWarning(null);
    try {
      await runExport(async () => {
        const warnings = await runAnkiExportDownload(
          () => createSubjectExportJob(subject.id),
          apkgFilenameForDeckTitle(subject.title),
        );
        const warningText = formatExportWarnings(warnings);
        if (warningText) {
          setExportWarning(warningText);
        } else {
          setNotice("Anki package downloaded");
        }
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    }
  }

  return { onExportAnki };
}
