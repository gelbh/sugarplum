import {
  schedulerForPrefs,
  type FsrsPrefs,
} from "../study/kernel";
import { buildGuestFsrsPrefs } from "./guestFsrsOptimize";
import {
  normalizeSchedulerCard,
  ratingToGrade,
} from "../study/kernel";
import { emptyFsrsCard } from "../study/kernel";
import {
  enqueueGuestMutation,
  readStore,
  writeStore,
} from "./storePersist";
import type { GuestReviewLog, Store } from "./storeTypes";

/**
 * Fill missing pre-review `scheduledDays` on guest logs via fuzz-off FSRS replay.
 * Leaves already-set values untouched. Returns whether any log was enriched.
 */
export async function enrichGuestReviewLogs(
  logs: GuestReviewLog[],
  prefs: FsrsPrefs,
): Promise<boolean> {
  const needs = logs.some(
    (l) =>
      typeof l.scheduledDays !== "number" || !Number.isFinite(l.scheduledDays),
  );
  if (!needs) return false;

  const byCard = new Map<string, GuestReviewLog[]>();
  for (const log of logs) {
    const list = byCard.get(log.cardId);
    if (list) list.push(log);
    else byCard.set(log.cardId, [log]);
  }

  const scheduler = await schedulerForPrefs({ ...prefs, enableFuzz: false });
  let changed = false;

  for (const [cardId, cardLogs] of byCard) {
    const ordered = [...cardLogs].sort((a, b) => a.at.localeCompare(b.at));
    let card = emptyFsrsCard(new Date(ordered[0]?.at ?? Date.now()), cardId);
    let cardOk = true;
    for (const log of ordered) {
      if (!cardOk) break;
      const when = Date.parse(log.at);
      if (!Number.isFinite(when)) {
        cardOk = false;
        break;
      }
      if (
        typeof log.scheduledDays !== "number" ||
        !Number.isFinite(log.scheduledDays)
      ) {
        log.scheduledDays = card.scheduledDays;
        changed = true;
      }
      const grade = ratingToGrade(log.rating);
      if (grade == null) {
        cardOk = false;
        break;
      }
      try {
        card = normalizeSchedulerCard(
          scheduler.review({
            card: card as never,
            grade,
            now: new Date(when),
          }).card,
        );
      } catch {
        cardOk = false;
        break;
      }
    }
  }

  return changed;
}

/** Idempotent guest-store enrich used by Insights and grade paths. */
export async function enrichGuestStoreScheduledDays(
  storage?: Store,
): Promise<boolean> {
  return enqueueGuestMutation(async () => {
    const store = readStore(storage);
    const prefs = buildGuestFsrsPrefs(store.studyPrefs, store.fsrsW);
    const changed = await enrichGuestReviewLogs(store.reviewLogs, prefs);
    if (changed) writeStore(store, storage);
    return changed;
  });
}
