import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { CardDraftView } from "../../api/client";
import {
  earliestPendingDueAt,
  isShortTermFollowUp,
  mergeDueLearning,
  nextLearningWakeAt,
  upsertPendingLearning,
  type PendingLearning,
} from "./learningRequeue";

export function formatLearningEta(dueAt: string, now = new Date()): string {
  const ms = Date.parse(dueAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "a moment";
  const mins = Math.max(1, Math.ceil(ms / 60_000));
  if (mins < 60) return `${mins}m`;
  return `${Math.ceil(mins / 60)}h`;
}

export type UseLearningRequeueArgs = {
  queueRef: MutableRefObject<CardDraftView[]>;
  setQueue: Dispatch<SetStateAction<CardDraftView[]>>;
  setQueueTotal: Dispatch<SetStateAction<number>>;
  setHadCards: Dispatch<SetStateAction<boolean>>;
  setRevealed: Dispatch<SetStateAction<boolean>>;
};

export type UseLearningRequeue = {
  pendingLearning: PendingLearning<CardDraftView>[];
  nextLearningDue: string | null;
  parkShortTermFollowUp: (
    card: CardDraftView,
    dueIso: string,
    state: number | undefined,
  ) => void;
  advanceAfterGrade: () => void;
  flushDueLearning: () => void;
  clearPendingLearning: () => void;
};

/**
 * Short-term FSRS learning sidecar: park graded follow-ups, wake/merge when due,
 * flush on visibility. Queue membership stays owned by the page via queueRef.
 */
export function useLearningRequeue(
  args: UseLearningRequeueArgs,
): UseLearningRequeue {
  const { queueRef, setQueue, setQueueTotal, setHadCards, setRevealed } = args;
  const [pendingLearning, setPendingLearning] = useState<
    PendingLearning<CardDraftView>[]
  >([]);
  const pendingLearningRef = useRef<PendingLearning<CardDraftView>[]>([]);

  const commitPendingLearning = useCallback(
    (next: PendingLearning<CardDraftView>[]) => {
      pendingLearningRef.current = next;
      setPendingLearning(next);
    },
    [],
  );

  const applyMergedQueue = useCallback(
    (
      merged: {
        queue: CardDraftView[];
        pending: PendingLearning<CardDraftView>[];
      },
      prevLen: number,
    ) => {
      const added = merged.queue.length - prevLen;
      queueRef.current = merged.queue;
      setQueue(merged.queue);
      commitPendingLearning(merged.pending);
      if (added > 0) {
        setQueueTotal((total) => total + added);
        setHadCards(true);
      }
    },
    [commitPendingLearning, queueRef, setHadCards, setQueue, setQueueTotal],
  );

  const parkShortTermFollowUp = useCallback(
    (card: CardDraftView, dueIso: string, state: number | undefined) => {
      const gradedAt = new Date();
      if (isShortTermFollowUp({ dueIso, gradedAt, state })) {
        commitPendingLearning(
          upsertPendingLearning(pendingLearningRef.current, {
            cardId: card.id,
            dueAt: dueIso,
            card,
          }),
        );
      } else {
        commitPendingLearning(
          pendingLearningRef.current.filter((p) => p.cardId !== card.id),
        );
      }
    },
    [commitPendingLearning],
  );

  const flushDueLearning = useCallback(() => {
    const prev = queueRef.current;
    applyMergedQueue(
      mergeDueLearning(prev, pendingLearningRef.current, new Date()),
      prev.length,
    );
  }, [applyMergedQueue, queueRef]);

  const advanceAfterGrade = useCallback(() => {
    const sliced = queueRef.current.slice(1);
    applyMergedQueue(
      mergeDueLearning(sliced, pendingLearningRef.current, new Date()),
      sliced.length,
    );
    setRevealed(false);
  }, [applyMergedQueue, queueRef, setRevealed]);

  useEffect(() => {
    if (pendingLearning.length === 0) return;
    const wake = nextLearningWakeAt(pendingLearning, new Date());
    // Already-due pending: wakeAt is null; flush now or soft_wait can stick.
    if (!wake) {
      flushDueLearning();
      return;
    }
    const delay = Math.max(0, wake.getTime() - Date.now());
    const id = window.setTimeout(() => {
      flushDueLearning();
    }, delay);
    return () => window.clearTimeout(id);
  }, [flushDueLearning, pendingLearning]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      flushDueLearning();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [flushDueLearning]);

  const clearPendingLearning = useCallback(() => {
    commitPendingLearning([]);
  }, [commitPendingLearning]);

  return {
    pendingLearning,
    nextLearningDue: earliestPendingDueAt(pendingLearning),
    parkShortTermFollowUp,
    advanceAfterGrade,
    flushDueLearning,
    clearPendingLearning,
  };
}
