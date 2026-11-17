import type { Dispatch, SetStateAction } from "react";
import {
  ApiError,
  asRegenType,
  dismissJob,
  regenCard,
  regenJob,
  type CardDraftView,
} from "../api/client";
import { navigate } from "../nav/navigate";

type Notice = {
  message: string;
  tone: "success" | "reject" | "info" | "error";
  undoCardId?: string;
};

type Args = {
  jobId: string | null;
  current: CardDraftView | null;
  begin: (label?: string) => void;
  end: (ok?: boolean) => void;
  setDrafts: Dispatch<SetStateAction<CardDraftView[]>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  setJobStatus: Dispatch<SetStateAction<string | null>>;
  setReady: Dispatch<SetStateAction<boolean>>;
  setRegenNonce: Dispatch<SetStateAction<number>>;
  setRegenHints: Dispatch<SetStateAction<string[] | null>>;
  setCardRegenBusy: Dispatch<SetStateAction<boolean>>;
  setProgressGate: Dispatch<SetStateAction<boolean>>;
};

export function useDraftReviewRegen({
  jobId,
  current,
  begin,
  end,
  setDrafts,
  setDirty,
  setError,
  setNotice,
  setJobStatus,
  setReady,
  setRegenNonce,
  setRegenHints,
  setCardRegenBusy,
  setProgressGate,
}: Args) {
  async function onRegenThisCard() {
    if (!current) return;
    const type = asRegenType(current.type);
    if (!type) {
      setError("Choose Q&A, cloze, or multiple choice before regenerating");
      return;
    }
    setError(null);
    setNotice(null);
    setCardRegenBusy(true);
    begin("Regenerating card…");
    try {
      const updated = await regenCard(current.id, { type });
      setDrafts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setDirty(false);
      setRegenNonce((n) => n + 1);
      setNotice({ message: "Card regenerated", tone: "info" });
      end();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not regenerate card",
      );
      end(false);
    } finally {
      setCardRegenBusy(false);
    }
  }

  async function onRegen() {
    if (!jobId) return;
    setError(null);
    setNotice(null);
    setRegenHints(null);
    begin();
    try {
      await regenJob(jobId, []);
      setDrafts([]);
      setJobStatus("queued");
      setDirty(false);
      setReady(false);
      setProgressGate(false);
      end();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not regenerate");
      end(false);
    }
  }

  async function onDismissFailed() {
    if (!jobId) return;
    setError(null);
    setNotice(null);
    begin("Discarding…");
    try {
      const { deck_id } = await dismissJob(jobId);
      end();
      navigate(`/library/decks/${encodeURIComponent(deck_id)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not discard job");
      end(false);
    }
  }

  return { onRegenThisCard, onRegen, onDismissFailed };
}
