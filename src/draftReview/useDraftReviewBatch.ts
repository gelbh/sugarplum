import type { Dispatch, SetStateAction } from "react";
import {
  ApiError,
  acceptAllJobDrafts,
  patchCard,
  rejectJobDrafts,
  type CardDraftView,
} from "../api/client";
import { cardPatchBody } from "../cards/cardPatchBody";

type Notice = {
  message: string;
  tone: "success" | "reject" | "info" | "error";
  undoCardId?: string;
};

type Args = {
  jobId: string | null;
  current: CardDraftView | null;
  dirty: boolean;
  begin: (label?: string) => void;
  end: (ok?: boolean) => void;
  enqueueUnlocks: (unlocks: readonly unknown[]) => void;
  load: (id: string) => Promise<CardDraftView[]>;
  refreshJourney: (id: string, draftCount: number) => Promise<void>;
  setConfirmAll: Dispatch<SetStateAction<boolean>>;
  setConfirmRejectDrafts: Dispatch<SetStateAction<boolean>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<Notice | null>>;
};

export function useDraftReviewBatch({
  jobId,
  current,
  dirty,
  begin,
  end,
  enqueueUnlocks,
  load,
  refreshJourney,
  setConfirmAll,
  setConfirmRejectDrafts,
  setDirty,
  setError,
  setNotice,
}: Args) {
  async function onAcceptAll() {
    if (!jobId) return;
    setError(null);
    setNotice(null);
    setConfirmAll(false);
    begin();
    try {
      if (dirty && current) {
        await patchCard(current.id, cardPatchBody(current));
      }
      const result = await acceptAllJobDrafts(jobId);
      if (result.unlocks?.length) {
        enqueueUnlocks(result.unlocks);
      }
      const list = await load(jobId);
      await refreshJourney(jobId, list.length);
      if (result.failed > 0) {
        setNotice({
          message: `Accepted ${result.accepted}; ${result.failed} could not be accepted`,
          tone: "error",
        });
      } else if (result.rejectedSiblingCount > 0) {
        setNotice({
          message: `Accepted ${result.accepted}; discarded ${result.rejectedSiblingCount} other drafts`,
          tone: "success",
        });
      } else {
        setNotice({
          message:
            result.accepted === 1
              ? "Accepted 1 card into study"
              : `Accepted ${result.accepted} cards into study`,
          tone: "success",
        });
      }
      end();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept all");
      end(false);
    }
  }

  async function onRejectRemainingDrafts() {
    if (!jobId) return;
    setError(null);
    setNotice(null);
    setConfirmRejectDrafts(false);
    begin();
    try {
      const result = await rejectJobDrafts(jobId);
      const list = await load(jobId);
      setDirty(false);
      await refreshJourney(jobId, list.length);
      setNotice({
        message:
          result.rejectedCount === 0
            ? "No remaining drafts to reject"
            : result.rejectedCount === 1
              ? "Rejected 1 remaining draft"
              : `Rejected ${result.rejectedCount} remaining drafts`,
        tone: result.rejectedCount === 0 ? "info" : "reject",
      });
      end();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not reject remaining drafts",
      );
      end(false);
    }
  }

  return { onAcceptAll, onRejectRemainingDrafts };
}
