import type { Dispatch, SetStateAction } from "react";
import {
  ApiError,
  asRegenType,
  dismissJob,
  generateCardFromClaim,
  generateCardsFromOrphanClaims,
  regenCard,
  regenJob,
  type CardDraftView,
  type ClaimCoverage,
} from "../api/client";
import { navigate } from "../nav/navigate";
import type { DraftReviewNotice, DraftReviewTracked } from "./draftReviewTypes";

export type DraftReviewRegenCtx = DraftReviewTracked & {
  jobId: string | null;
  current: CardDraftView | null;
  setDrafts: Dispatch<SetStateAction<CardDraftView[]>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<DraftReviewNotice | null>>;
  setJobStatus: Dispatch<SetStateAction<string | null>>;
  setReady: Dispatch<SetStateAction<boolean>>;
  setRegenNonce: Dispatch<SetStateAction<number>>;
  setRegenConfirmOpen: Dispatch<SetStateAction<boolean>>;
  setCardRegenBusy: Dispatch<SetStateAction<boolean>>;
  setProgressGate: Dispatch<SetStateAction<boolean>>;
  setClaimCoverage: Dispatch<SetStateAction<ClaimCoverage | null>>;
  setGeneratingClaimId: Dispatch<SetStateAction<string | null>>;
  setFillAllBusy: Dispatch<SetStateAction<boolean>>;
  generatingClaimId: string | null;
  fillAllBusy: boolean;
  cardRegenBusy: boolean;
  busy: boolean;
};

export function createDraftReviewRegen(ctx: DraftReviewRegenCtx) {
  const {
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
    setRegenConfirmOpen,
    setCardRegenBusy,
    setProgressGate,
    setClaimCoverage,
    setGeneratingClaimId,
    setFillAllBusy,
    generatingClaimId,
    fillAllBusy,
    cardRegenBusy,
    busy,
  } = ctx;

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
    setRegenConfirmOpen(false);
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

  function applyCoverageFromDrafts(
    drafts: CardDraftView[],
    prev: ClaimCoverage | null,
  ): ClaimCoverage | null {
    if (!prev) return prev;
    const byClaim = new Map(
      drafts
        .filter((d) => d.claim_id != null)
        .map((d) => [d.claim_id as string, d]),
    );
    const claims = prev.claims.map((row) => {
      const draft = byClaim.get(row.id);
      if (!draft) return row;
      return { ...row, card_id: draft.id, card_status: draft.status };
    });
    const linked = claims.filter((c) => c.card_id != null).length;
    return {
      claims,
      summary: {
        total: claims.length,
        linked,
        orphan: claims.length - linked,
      },
    };
  }

  async function onGenerateOrphan(claimId: string) {
    if (!jobId || generatingClaimId || fillAllBusy || busy || cardRegenBusy) {
      return;
    }
    setError(null);
    setNotice(null);
    setGeneratingClaimId(claimId);
    setCardRegenBusy(true);
    begin("Generating card…");
    try {
      const draft = await generateCardFromClaim(jobId, claimId);
      setDrafts((prev) => [draft, ...prev.filter((d) => d.id !== draft.id)]);
      setDirty(false);
      setRegenNonce((n) => n + 1);
      if (draft.claim_id) {
        setClaimCoverage((prev) => applyCoverageFromDrafts([draft], prev));
      }
      setNotice({ message: "Card generated from claim", tone: "info" });
      end();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not generate card from claim",
      );
      end(false);
    } finally {
      setGeneratingClaimId(null);
      setCardRegenBusy(false);
    }
  }

  async function onFillAllOrphans() {
    if (!jobId || generatingClaimId || fillAllBusy || busy || cardRegenBusy) {
      return;
    }
    setError(null);
    setNotice(null);
    setFillAllBusy(true);
    setCardRegenBusy(true);
    begin("Filling orphan claims…");
    try {
      const result = await generateCardsFromOrphanClaims(jobId);
      if (result.cards.length > 0) {
        setDrafts((prev) => {
          const ids = new Set(result.cards.map((c) => c.id));
          return [...result.cards, ...prev.filter((d) => !ids.has(d.id))];
        });
        setClaimCoverage((prev) =>
          applyCoverageFromDrafts(result.cards, prev),
        );
      }
      setDirty(false);
      setRegenNonce((n) => n + 1);
      if (result.filled === 0 && result.remaining > 0) {
        setNotice({
          message: "Could not fill orphans right now; try again later",
          tone: "info",
        });
      } else if (result.remaining > 0) {
        setNotice({
          message: `Filled ${result.filled}; ${result.remaining} still orphan`,
          tone: "info",
        });
      } else if (result.filled > 0) {
        setNotice({
          message: `Filled ${result.filled} orphan claim${result.filled === 1 ? "" : "s"}`,
          tone: "info",
        });
      } else {
        setNotice({ message: "No orphan claims to fill", tone: "info" });
      }
      end();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not fill orphan claims",
      );
      end(false);
    } finally {
      setFillAllBusy(false);
      setCardRegenBusy(false);
    }
  }

  return {
    onRegenThisCard,
    onRegen,
    onDismissFailed,
    onGenerateOrphan,
    onFillAllOrphans,
  };
}
