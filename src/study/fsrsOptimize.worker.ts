/// <reference lib="webworker" />

import { FSRS_NEXT_DAY_STARTS_AT } from "./fsrsOptimizeConstants";

export type FsrsOptimizeWorkerRequest = { csv: string };
export type FsrsOptimizeWorkerResponse =
  | { ok: true; w: number[] }
  | { ok: false; error: string };

/**
 * Threadless wasip1 build (no COOP/COEP). Runs inside this dedicated Worker so
 * the main thread stays responsive while computeParameters is sync-under-Promise.
 * Dynamic import needs worker.format "es" (IIFE cannot code-split).
 */
self.onmessage = async (ev: MessageEvent<FsrsOptimizeWorkerRequest>) => {
  try {
    const { convertCsvToFsrsItems, computeParameters } = await import(
      "@open-spaced-repetition/binding-wasm32-wasip1"
    );
    const bytes = new TextEncoder().encode(ev.data.csv);
    const items = convertCsvToFsrsItems(
      bytes,
      FSRS_NEXT_DAY_STARTS_AT,
      "UTC",
      "FSRS-7",
    );
    const w = await computeParameters(items, {
      modelVersion: "FSRS-7",
      enableShortTerm: true,
    });
    const response: FsrsOptimizeWorkerResponse = {
      ok: true,
      w: Array.from(w),
    };
    self.postMessage(response);
  } catch (err) {
    const response: FsrsOptimizeWorkerResponse = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
