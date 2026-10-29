import {
  downloadExport,
  type CreateDeckExportResponse,
  type ExportWarnings,
} from "../api/client";

/** Human-readable warning line after a successful download, or null if clean. */
export function formatExportWarnings(warnings: ExportWarnings): string | null {
  const { missingMedia, skippedCards } = warnings;
  if (missingMedia === 0 && skippedCards === 0) return null;
  const parts: string[] = [];
  if (skippedCards > 0) {
    parts.push(
      `${skippedCards} card${skippedCards === 1 ? "" : "s"} skipped`,
    );
  }
  if (missingMedia > 0) {
    parts.push(
      `${missingMedia} missing media file${missingMedia === 1 ? "" : "s"}`,
    );
  }
  return `Download started. Export warnings: ${parts.join("; ")}.`;
}

/** Create export job then trigger browser download; returns job warnings. */
export async function runAnkiExportDownload(
  create: () => Promise<CreateDeckExportResponse>,
  fallbackFilename: string,
): Promise<ExportWarnings> {
  const job = await create();
  await downloadExport(job.id, fallbackFilename);
  return job.warnings;
}
