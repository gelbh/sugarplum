import { fsrs } from "ts-fsrs";

/** Subset of study prefs that affect ts-fsrs scheduling. */
export type FsrsPrefs = {
  desiredRetention: number;
  enableFuzz: boolean;
};

const DEFAULT_FSRS_PREFS: FsrsPrefs = {
  desiredRetention: 0.9,
  enableFuzz: true,
};

/** Build a ts-fsrs scheduler from study prefs (learning steps stay at library defaults). */
export function fsrsForPrefs(
  prefs: FsrsPrefs = DEFAULT_FSRS_PREFS,
): ReturnType<typeof fsrs> {
  return fsrs({
    request_retention: prefs.desiredRetention,
    enable_fuzz: prefs.enableFuzz,
  });
}
