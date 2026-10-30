import { useCallback, useEffect, useState } from "react";
import type { CardDraftView } from "../api/client";
import { useUnlockToasts } from "../achievements/UnlockToastProvider";
import { isGuest } from "../guest/session";
import { listPendingGrades } from "./pendingGrades";
import {
  formatFlushSummary,
  runPendingFlush,
  type FlushSummary,
} from "./runPendingFlush";
import { warmDueMedia } from "./warmDueMedia";

export type PendingGradeSync = {
  userId: string | null;
  setUserId: (id: string | null) => void;
  pendingCount: number;
  syncSummary: string | null;
  setSyncSummary: (value: string | null) => void;
  refreshPendingCount: (uid: string) => void;
  /** Flush once on mount path (auth only). Returns summary or null. */
  flushOnMount: (uid: string) => Promise<FlushSummary | null>;
};

/**
 * Shared pending-grade count, flush summary, mount flush helper, and online flush.
 * Pages supply onDueRefreshed when a successful flush returns a fresh due list.
 */
export function usePendingGradeSync(options: {
  onDueRefreshed?: (due: CardDraftView[]) => void;
  onDueRefreshFailed?: (userId: string) => void | Promise<void>;
}): PendingGradeSync {
  const { onDueRefreshed, onDueRefreshFailed } = options;
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);

  const refreshPendingCount = useCallback((uid: string) => {
    setPendingCount(listPendingGrades(uid).length);
  }, []);

  const { enqueueUnlocks } = useUnlockToasts();

  const applyFlushSummary = useCallback(
    (summary: FlushSummary | null) => {
      if (!summary) return;
      if (summary.unlocks.length > 0) enqueueUnlocks(summary.unlocks);
      if (summary.applied <= 0 && summary.skipped <= 0) return;
      setSyncSummary(formatFlushSummary(summary));
    },
    [enqueueUnlocks],
  );

  const flushOnMount = useCallback(
    async (uid: string): Promise<FlushSummary | null> => {
      if (isGuest()) return null;
      try {
        const summary = await runPendingFlush(uid);
        applyFlushSummary(summary);
        refreshPendingCount(uid);
        return summary;
      } catch {
        return null;
      }
    },
    [applyFlushSummary, refreshPendingCount],
  );

  useEffect(() => {
    if (!userId || isGuest()) return;

    function onOnline() {
      if (!userId) return;
      void (async () => {
        try {
          const summary = await runPendingFlush(userId);
          applyFlushSummary(summary);
          refreshPendingCount(userId);
          if (summary && summary.applied > 0) {
            if (summary.due) {
              warmDueMedia(summary.due);
              onDueRefreshed?.(summary.due);
            } else {
              await onDueRefreshFailed?.(userId);
            }
          }
        } catch {
          /* stay on current queue / count */
        }
      })();
    }

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [
    applyFlushSummary,
    onDueRefreshFailed,
    onDueRefreshed,
    refreshPendingCount,
    userId,
  ]);

  return {
    userId,
    setUserId,
    pendingCount,
    syncSummary,
    setSyncSummary,
    refreshPendingCount,
    flushOnMount,
  };
}
