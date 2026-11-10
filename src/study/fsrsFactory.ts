import { DefaultScheduler } from "ts-fsrs";
import { validateFsrsW } from "./fsrsWeights";

/** Subset of study prefs that affect ts-fsrs scheduling. */
export type FsrsPrefs = {
  desiredRetention: number;
  enableFuzz: boolean;
  /** Personal FSRS weights (21 for FSRS-6; 34 for FSRS-7); omit for library defaults. */
  w?: readonly number[];
  /** Model version for DefaultScheduler (default FSRS-7). */
  modelVersion?: "FSRS-6" | "FSRS-7";
};

const DEFAULT_FSRS_PREFS: FsrsPrefs = {
  desiredRetention: 0.9,
  enableFuzz: true,
  modelVersion: "FSRS-7",
};

export type StudyScheduler = Awaited<ReturnType<typeof DefaultScheduler>>;

const schedulerCache = new Map<string, StudyScheduler>();

function cacheKey(prefs: FsrsPrefs, validated: number[] | null): string {
  const version = prefs.modelVersion ?? "FSRS-7";
  return JSON.stringify({
    v: version,
    r: prefs.desiredRetention,
    f: prefs.enableFuzz,
    w: validated,
  });
}

/** Build a DefaultScheduler from study prefs (async factory; results cached). */
export async function schedulerForPrefs(
  prefs: FsrsPrefs = DEFAULT_FSRS_PREFS,
): Promise<StudyScheduler> {
  const version = prefs.modelVersion ?? "FSRS-7";
  const validated = prefs.w ? validateFsrsW([...prefs.w]) : null;
  const key = cacheKey({ ...prefs, modelVersion: version }, validated);
  const hit = schedulerCache.get(key);
  if (hit) return hit;

  const scheduler = await DefaultScheduler({
    version,
    desiredRetention: prefs.desiredRetention,
    enableFuzz: prefs.enableFuzz,
    ...(validated ? { weights: validated } : {}),
  });
  schedulerCache.set(key, scheduler);
  return scheduler;
}

/** Test helper: drop cached schedulers between cases. */
export function clearSchedulerCache(): void {
  schedulerCache.clear();
}
