import {
  downloadExport,
  getExport,
  type CreateDeckExportResponse,
  type ExportJobView,
  type ExportWarnings,
} from "../api/client";

export const ANKI_EXPORT_BUSY_LABEL = "Preparing Anki export…";

const EXPORT_POLL_MS = 500;
const EXPORT_POLL_TIMEOUT_MS = 10 * 60_000;

/** Human-readable warning line after a successful download, or null if clean. */
export function formatExportWarnings(warnings: ExportWarnings): string | null {
  const { missingMedia, skippedCards } = warnings;
  if (missingMedia === 0 && skippedCards === 0) return null;
  const parts: string[] = [];
  if (skippedCards > 0) {
    parts.push(`${skippedCards} card${skippedCards === 1 ? "" : "s"} skipped`);
  }
  if (missingMedia > 0) {
    parts.push(
      `${missingMedia} missing media file${missingMedia === 1 ? "" : "s"}`,
    );
  }
  return `Download started. Export warnings: ${parts.join("; ")}.`;
}

export type WaitForExportReadyOpts = {
  getExport: (id: string) => Promise<ExportJobView>;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
  timeoutMs?: number;
  now?: () => number;
};

/** Poll until export is ready or failed. Ready jobs are returned as-is. */
export async function waitForExportReady(
  initial: CreateDeckExportResponse,
  opts: WaitForExportReadyOpts,
): Promise<ExportJobView> {
  if (initial.status === "ready") {
    return {
      id: initial.id,
      status: initial.status,
      warnings: initial.warnings,
      downloadPath: initial.downloadPath,
    };
  }

  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pollMs = opts.pollMs ?? EXPORT_POLL_MS;
  const timeoutMs = opts.timeoutMs ?? EXPORT_POLL_TIMEOUT_MS;
  const now = opts.now ?? Date.now;
  const deadline = now() + timeoutMs;

  let job: ExportJobView = {
    id: initial.id,
    status: initial.status,
    warnings: initial.warnings,
    downloadPath: initial.downloadPath,
    error: undefined,
  };

  while (job.status === "queued" || job.status === "running") {
    if (now() >= deadline) {
      throw new Error("Timed out waiting for Anki export");
    }
    await sleep(pollMs);
    job = await opts.getExport(initial.id);
  }

  if (job.status === "failed") {
    throw new Error(job.error?.trim() || "Export failed");
  }
  if (job.status !== "ready") {
    throw new Error(`Unexpected export status: ${job.status}`);
  }
  return job;
}

/** Create export job then trigger browser download; returns job warnings. */
export async function runAnkiExportDownload(
  create: () => Promise<CreateDeckExportResponse>,
  fallbackFilename: string,
): Promise<ExportWarnings> {
  const created = await create();
  const job = await waitForExportReady(created, { getExport });
  await downloadExport(job.id, fallbackFilename);
  return job.warnings;
}
