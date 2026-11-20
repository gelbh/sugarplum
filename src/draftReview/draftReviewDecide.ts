import type { Dispatch, SetStateAction } from "react";
import type { ReviewDecision } from "../study";
import {
  ApiError,
  acceptCard,
  patchCard,
  rejectCard,
  undoReviewCard,
  type CardDraftView,
} from "../api/client";
import { cardPatchBody } from "./cardPatchBody";
import { REJECT_REASON_LABELS, type RejectReason } from "./rejectReasons";
import type {
  DraftReviewEnqueueUnlocks,
  DraftReviewNotice,
  DraftReviewTracked,
} from "./draftReviewTypes";

export type DraftReviewDecideCtx = DraftReviewTracked & {
  jobId: string | null;
  current: CardDraftView | null;
  dirty: boolean;
  notice: DraftReviewNotice | null;
  undoBusy: boolean;
  enqueueUnlocks: DraftReviewEnqueueUnlocks;
  load: (id: string) => Promise<CardDraftView[]>;
  refreshJourney: (id: string, draftCount: number) => Promise<void>;
  setDrafts: Dispatch<SetStateAction<CardDraftView[]>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<DraftReviewNotice | null>>;
  setUndoBusy: Dispatch<SetStateAction<boolean>>;
};

export function createDraftReviewDecide(ctx: DraftReviewDecideCtx) {
  const {
    jobId,
    current,
    dirty,
    notice,
    undoBusy,
    begin,
    end,
    enqueueUnlocks,
    load,
    refreshJourney,
    setDrafts,
    setDirty,
    setError,
    setNotice,
    setUndoBusy,
  } = ctx;

  function onEditorChange(
    next: Pick<CardDraftView, "front" | "back" | "type" | "options">,
  ) {
    if (!current) return;
    setDrafts((prev) =>
      prev.map((c) => (c.id === current.id ? { ...c, ...next } : c)),
    );
    setDirty(true);
  }

  async function reloadAfterDecision(
    id: string,
    decidedId: string,
    decidedNotice: DraftReviewNotice,
  ) {
    setNotice(decidedNotice);
    try {
      const list = await load(id);
      await refreshJourney(id, list.length);
      end();
    } catch (err) {
      setDrafts((prev) => prev.filter((c) => c.id !== decidedId));
      setDirty(false);
      setError(
        err instanceof ApiError ? err.message : "Could not reload drafts",
      );
      end(false);
    }
  }

  async function onUndoDecision() {
    if (!notice?.undoCardId || !jobId || undoBusy) return;
    const cardId = notice.undoCardId;
    setUndoBusy(true);
    setError(null);
    begin("Undoing…");
    try {
      await undoReviewCard(cardId);
      const list = await load(jobId);
      await refreshJourney(jobId, list.length);
      setNotice({ message: "Card restored to drafts", tone: "info" });
      end();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not undo");
      end(false);
    } finally {
      setUndoBusy(false);
    }
  }

  async function onAccept(): Promise<boolean> {
    if (!current || !jobId) return false;
    const decidedId = current.id;
    setError(null);
    setNotice(null);
    begin();
    try {
      if (dirty) {
        await patchCard(current.id, cardPatchBody(current));
      }
      const accepted = await acceptCard(current.id);
      if (accepted.unlocks?.length) {
        enqueueUnlocks(accepted.unlocks);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept");
      end(false);
      return false;
    }
    await reloadAfterDecision(jobId, decidedId, {
      message: "Accepted into study",
      tone: "success",
      undoCardId: decidedId,
    });
    return true;
  }

  async function onReject(reason: RejectReason | null): Promise<boolean> {
    if (!current || !jobId) return false;
    const decidedId = current.id;
    setError(null);
    setNotice(null);
    begin();
    try {
      await rejectCard(current.id, reason);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reject");
      end(false);
      return false;
    }
    await reloadAfterDecision(jobId, decidedId, {
      message: reason
        ? `Rejected · ${REJECT_REASON_LABELS[reason]}`
        : "Card rejected",
      tone: "reject",
      undoCardId: decidedId,
    });
    return true;
  }

  function onDecide(decision: ReviewDecision, reason: RejectReason | null) {
    return decision === "accept" ? onAccept() : onReject(reason);
  }

  return { onEditorChange, onUndoDecision, onDecide };
}
