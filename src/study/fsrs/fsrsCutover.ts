import { Reschedule } from "ts-fsrs/reschedule";
import { schedulerForPrefs, type FsrsPrefs } from "./fsrsFactory";
import { ratingToGrade, type ReviewLogReplayRow } from "./fsrsReplay";
import type { FsrsSchedulerCard } from "../retrievability";

export type CutoverMemory = {
  stability: number;
  difficulty: number;
  stabilityFast: number;
};

/**
 * Rebuild FSRS-7 memory from history via Reschedule.replay (dues unchanged).
 * Returns null when no valid rating+time steps exist.
 */
export async function replayMemoryFromLogs(
  logs: readonly ReviewLogReplayRow[],
  prefs: FsrsPrefs,
): Promise<CutoverMemory | null> {
  const scheduler = await schedulerForPrefs({
    ...prefs,
    enableFuzz: false,
    modelVersion: prefs.modelVersion ?? "FSRS-7",
  });
  const history = [...logs]
    .sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at))
    .flatMap((row) => {
      const when = Date.parse(row.reviewed_at);
      if (!Number.isFinite(when)) return [];
      const grade = ratingToGrade(row.rating);
      if (grade == null) return [];
      return [{ rating: grade, reviewTime: new Date(when) }];
    });
  if (history.length === 0) return null;

  const rs = new Reschedule(scheduler);
  const { memoryState } = rs.replay({ history });
  const mem = memoryState as {
    stability: number;
    difficulty: number;
    stabilityFast?: number;
  };
  if (
    !Number.isFinite(mem.stability) ||
    !Number.isFinite(mem.difficulty) ||
    mem.stabilityFast == null ||
    !Number.isFinite(mem.stabilityFast)
  ) {
    return null;
  }
  return {
    stability: mem.stability,
    difficulty: mem.difficulty,
    stabilityFast: mem.stabilityFast,
  };
}

export function applyCutoverMemory(
  card: FsrsSchedulerCard,
  memory: CutoverMemory,
): FsrsSchedulerCard {
  return {
    ...card,
    stability: memory.stability,
    difficulty: memory.difficulty,
    stabilityFast: memory.stabilityFast,
  };
}
