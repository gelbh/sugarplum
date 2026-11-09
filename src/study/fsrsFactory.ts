import { fsrs } from "ts-fsrs";
import type { StudyPrefs } from "./policyQueue";
import { DEFAULT_STUDY_PREFS } from "./policyQueue";

export type FsrsPrefs = Pick<StudyPrefs, "desiredRetention" | "enableFuzz">;

/** Build a ts-fsrs scheduler from study prefs (learning steps stay at library defaults). */
export function fsrsForPrefs(
  prefs: FsrsPrefs = DEFAULT_STUDY_PREFS,
): ReturnType<typeof fsrs> {
  return fsrs({
    request_retention: prefs.desiredRetention,
    enable_fuzz: prefs.enableFuzz,
  });
}
