import {
  getFsrsOptimizeStatus,
  getFsrsRevlogCsv,
  putFsrsWeights,
} from "../api/client";
import { isGuest } from "../guest/session";
import {
  guestGetFsrsRevlogCsv,
  guestMarkFsrsOptimizePendingIfDue,
  guestSaveFsrsWeights,
} from "../guest/store";
import type {
  FsrsOptimizeWorkerRequest,
  FsrsOptimizeWorkerResponse,
} from "./fsrsOptimize.worker";
import FsrsOptimizeWorker from "./fsrsOptimize.worker?worker";

let inFlight = false;
let skipAutoThisSession = false;

/** Test seam: reset session guards. */
export function resetFsrsOptimizeClientGuardsForTests(): void {
  inFlight = false;
  skipAutoThisSession = false;
}

async function trainWeightsFromCsv(csv: string): Promise<number[]> {
  const worker = new FsrsOptimizeWorker();
  try {
    const result = await new Promise<FsrsOptimizeWorkerResponse>((resolve, reject) => {
      worker.onmessage = (ev: MessageEvent<FsrsOptimizeWorkerResponse>) => {
        resolve(ev.data);
      };
      worker.onerror = (err) => {
        reject(err);
      };
      const msg: FsrsOptimizeWorkerRequest = { csv };
      worker.postMessage(msg);
    });
    if (!result.ok) throw new Error(result.error);
    return result.w;
  } finally {
    worker.terminate();
  }
}

async function trainAndSaveAccount(): Promise<void> {
  const csv = await getFsrsRevlogCsv();
  const w = await trainWeightsFromCsv(csv);
  await putFsrsWeights(w);
}

async function trainAndSaveGuest(): Promise<void> {
  const csv = guestGetFsrsRevlogCsv();
  const w = await trainWeightsFromCsv(csv);
  guestSaveFsrsWeights(w);
}

/**
 * Auto path: if pending, train in a Web Worker and persist weights.
 * Guests use local store + CSV; accounts use API. At most one in-flight;
 * failures skip further auto attempts for this page session.
 */
export async function maybeRunFsrsOptimize(): Promise<"skipped" | "ran" | "failed"> {
  if (inFlight || skipAutoThisSession) return "skipped";
  inFlight = true;
  try {
    if (isGuest()) {
      const status = guestMarkFsrsOptimizePendingIfDue();
      if (!status.pending) return "skipped";
      await trainAndSaveGuest();
      return "ran";
    }
    const status = await getFsrsOptimizeStatus();
    if (!status.pending) return "skipped";
    await trainAndSaveAccount();
    return "ran";
  } catch {
    skipAutoThisSession = true;
    return "failed";
  } finally {
    inFlight = false;
  }
}

/** Manual Run now: force train regardless of pending flag. */
export async function runFsrsOptimizeTrainNow(): Promise<void> {
  if (inFlight) throw new Error("Optimize already in progress");
  inFlight = true;
  try {
    if (isGuest()) {
      await trainAndSaveGuest();
    } else {
      await trainAndSaveAccount();
    }
    skipAutoThisSession = false;
  } finally {
    inFlight = false;
  }
}
