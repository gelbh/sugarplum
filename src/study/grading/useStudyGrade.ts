import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { rememberUnlocks } from "../../achievements/rememberUnlocks";
import type { UnlockView } from "../../achievements/wire";
import {
  ApiError,
  reviewCard,
  type CardDraftView,
  type StudyRating,
} from "../../api/client";
import { isGuest } from "../../guest/session";
import type { DueScopeOpts } from "../queue/dueCache";
import { pruneDueCacheCard } from "../queue/dueCache";
import { clientLocalDay } from "../localDay";
import { enqueuePendingGrade } from "./pendingGrades";
import { isNetworkGradeError } from "./runPendingFlush";
import { addGrade, type GradeTally } from "../session/sessionTally";

type Args = {
  current: CardDraftView | null;
  revealed: boolean;
  busyRef: MutableRefObject<boolean>;
  flightBusyRef: MutableRefObject<boolean>;
  begin: () => void;
  end: (ok?: boolean) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  offlineCopy: boolean;
  userId: string | null;
  scopeOpts: DueScopeOpts | undefined;
  refreshPendingCount: (uid: string) => void;
  enqueueUnlocks: (unlocks: readonly unknown[]) => void;
  setUnlocks: Dispatch<SetStateAction<readonly UnlockView[]>>;
  setTally: Dispatch<SetStateAction<GradeTally>>;
  parkShortTermFollowUp: (
    card: CardDraftView,
    dueIso: string,
    state: number | undefined,
  ) => void;
  advanceAfterGrade: () => void;
  playGradeMailboxMotion: (rating: StudyRating) => Promise<void>;
  queueRef: MutableRefObject<CardDraftView[]>;
  setQueue: Dispatch<SetStateAction<CardDraftView[]>>;
  setRevealed: Dispatch<SetStateAction<boolean>>;
};

export function useStudyGrade({
  current,
  revealed,
  busyRef,
  flightBusyRef,
  begin,
  end,
  setError,
  offlineCopy,
  userId,
  scopeOpts,
  refreshPendingCount,
  enqueueUnlocks,
  setUnlocks,
  setTally,
  parkShortTermFollowUp,
  advanceAfterGrade,
  playGradeMailboxMotion,
  queueRef,
  setQueue,
  setRevealed,
}: Args) {
  const onGrade = useCallback(
    async (rating: StudyRating, fromMcq = false): Promise<boolean> => {
      if (!current || busyRef.current || flightBusyRef.current) return false;
      if (!fromMcq && !revealed) return false;
      busyRef.current = true;
      setError(null);
      begin();

      const queueOffline = async (uid: string) => {
        if (!enqueuePendingGrade(uid, current.id, rating)) {
          setError("Could not save grade offline (storage full).");
          end(false);
          return false;
        }
        setTally((prev) => addGrade(prev, rating));
        pruneDueCacheCard(uid, current.id, scopeOpts);
        refreshPendingCount(uid);
        await playGradeMailboxMotion(rating);
        advanceAfterGrade();
        end();
        return true;
      };

      if (!isGuest() && offlineCopy && userId) {
        return queueOffline(userId);
      }

      try {
        const result = await reviewCard(current.id, rating, {
          localDay: clientLocalDay(),
        });
        setTally((prev) => addGrade(prev, rating));
        parkShortTermFollowUp(current, result.due, result.state);
        // Unlock toast after flight so FruitMedal mount/filter paint does not
        // contend with the WAAPI swallow.
        await playGradeMailboxMotion(rating);
        const incoming = result.unlocks;
        if (incoming?.length) {
          enqueueUnlocks(incoming);
          setUnlocks((prev) => rememberUnlocks(prev, incoming));
        }
        advanceAfterGrade();
        end();
        return true;
      } catch (err) {
        if (!isGuest() && userId && isNetworkGradeError(err)) {
          return queueOffline(userId);
        }
        setError(
          err instanceof ApiError ? err.message : "Could not save grade",
        );
        end(false);
        return false;
      }
    },
    [
      advanceAfterGrade,
      begin,
      busyRef,
      current,
      end,
      enqueueUnlocks,
      flightBusyRef,
      offlineCopy,
      parkShortTermFollowUp,
      playGradeMailboxMotion,
      refreshPendingCount,
      revealed,
      scopeOpts,
      setError,
      setTally,
      setUnlocks,
      userId,
    ],
  );

  const replaceQueuedCard = useCallback(
    (updated: CardDraftView) => {
      const next = queueRef.current.map((c) =>
        c.id === updated.id ? updated : c,
      );
      queueRef.current = next;
      setQueue(next);
    },
    [queueRef, setQueue],
  );

  const removeQueuedCard = useCallback(
    (cardId: string) => {
      const next = queueRef.current.filter((c) => c.id !== cardId);
      queueRef.current = next;
      setQueue(next);
      setRevealed(false);
    },
    [queueRef, setQueue, setRevealed],
  );

  return { onGrade, replaceQueuedCard, removeQueuedCard };
}
