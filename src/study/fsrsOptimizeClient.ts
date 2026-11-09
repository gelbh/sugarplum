import {
  getFsrsOptimizeStatus,
  getFsrsRevlogCsv,
  putFsrsWeights,
} from "../api/client";
import { isGuest } from "../guest/session";
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

/** True while a train is running (also used by Settings UI). */
export function isFsrsOptimizeInFlight(): boolean {
  return inFlight;
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

/**
 * If the account has optimize pending, train in a Web Worker and PUT weights.
 * No-ops for guests; at most one in-flight train; failures skip further auto
 * attempts for this page session.
 */
export async function maybeRunFsrsOptimize(): Promise<"skipped" | "ran" | "failed"> {
  if (isGuest() || inFlight || skipAutoThisSession) return "skipped";
  inFlight = true;
  try {
    const status = await getFsrsOptimizeStatus();
    if (!status.pending) return "skipped";
    const csv = await getFsrsRevlogCsv();
    const w = await trainWeightsFromCsv(csv);
    await putFsrsWeights(w);
    return "ran";
  } catch {
    skipAutoThisSession = true;
    return "failed";
  } finally {
    inFlight = false;
  }
}

/** Force a train when pending (or after run-now). Respects in-flight guard only. */
export async function runFsrsOptimizeTrainNow(): Promise<void> {
  if (isGuest()) throw new Error("Guest cannot optimize FSRS weights");
  if (inFlight) throw new Error("Optimize already in progress");
  inFlight = true;
  try {
    const csv = await getFsrsRevlogCsv();
    const w = await trainWeightsFromCsv(csv);
    await putFsrsWeights(w);
    skipAutoThisSession = false;
  } finally {
    inFlight = false;
  }
}
