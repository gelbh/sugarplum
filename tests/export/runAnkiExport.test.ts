import { describe, expect, it, vi } from "vitest";
import { waitForExportReady } from "../../src/export/runAnkiExport";
import type { ExportJobView } from "../../src/api/client";

describe("waitForExportReady", () => {
  it("returns immediately when create already ready", async () => {
    const getExport = vi.fn();
    const job = await waitForExportReady(
      {
        id: "e1",
        status: "ready",
        warnings: { missingMedia: 0, skippedCards: 0 },
        downloadPath: "/api/exports/e1/download",
      },
      { getExport },
    );
    expect(job.status).toBe("ready");
    expect(getExport).not.toHaveBeenCalled();
  });

  it("polls until ready", async () => {
    const views: ExportJobView[] = [
      {
        id: "e1",
        status: "queued",
        warnings: { missingMedia: 0, skippedCards: 0 },
        downloadPath: null,
      },
      {
        id: "e1",
        status: "running",
        warnings: { missingMedia: 0, skippedCards: 0 },
        downloadPath: null,
      },
      {
        id: "e1",
        status: "ready",
        warnings: { missingMedia: 1, skippedCards: 0 },
        downloadPath: "/api/exports/e1/download",
      },
    ];
    const getExport = vi.fn(async () => {
      const next = views.shift();
      if (!next) throw new Error("no more views");
      return next;
    });
    const sleep = vi.fn(async () => undefined);

    const job = await waitForExportReady(
      {
        id: "e1",
        status: "queued",
        warnings: { missingMedia: 0, skippedCards: 0 },
        downloadPath: null,
      },
      { getExport, sleep, pollMs: 1, timeoutMs: 10_000 },
    );

    expect(job.status).toBe("ready");
    expect(job.warnings.missingMedia).toBe(1);
    expect(getExport).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalled();
  });

  it("throws on failed status with error message", async () => {
    const getExport = vi.fn(async () => ({
      id: "e1",
      status: "failed",
      warnings: { missingMedia: 0, skippedCards: 0 },
      downloadPath: null,
      error: "boom",
    }));

    await expect(
      waitForExportReady(
        {
          id: "e1",
          status: "queued",
          warnings: { missingMedia: 0, skippedCards: 0 },
          downloadPath: null,
        },
        { getExport, sleep: async () => undefined, pollMs: 1 },
      ),
    ).rejects.toThrow("boom");
  });
});
