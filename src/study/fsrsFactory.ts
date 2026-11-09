import { fsrs } from "ts-fsrs";
import { FSRS_W_LENGTH, validateFsrsW } from "./fsrsWeights";

/** Subset of study prefs that affect ts-fsrs scheduling. */
export type FsrsPrefs = {
  desiredRetention: number;
  enableFuzz: boolean;
  /** Personal FSRS-6 weights (21); omit for library defaults. */
  w?: readonly number[];
};

const DEFAULT_FSRS_PREFS: FsrsPrefs = {
  desiredRetention: 0.9,
  enableFuzz: true,
};

/** Build a ts-fsrs scheduler from study prefs (learning steps stay at library defaults). */
export function fsrsForPrefs(
  prefs: FsrsPrefs = DEFAULT_FSRS_PREFS,
): ReturnType<typeof fsrs> {
  const validated = prefs.w ? validateFsrsW([...prefs.w]) : null;
  return fsrs({
    request_retention: prefs.desiredRetention,
    enable_fuzz: prefs.enableFuzz,
    ...(validated && validated.length === FSRS_W_LENGTH ? { w: validated } : {}),
  });
}
