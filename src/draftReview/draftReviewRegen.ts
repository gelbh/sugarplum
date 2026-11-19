import type { Dispatch, SetStateAction } from "react";
import {
  ApiError,
  asRegenType,
  dismissJob,
  generateCardFromClaim,
  generateCardsFromOrphanClaims,
  getFillAllOrphansStatus,
  getJobClaimCoverage,
  listJobDrafts,
  regenCard,
  regenJob,
  type CardDraftView,
  type ClaimCoverage,
  type FillAllRunStatus,
} from "../api/client";
import { navigate } from "../nav/navigate";
import type { DraftReviewNotice, DraftReviewTracked } from "./draftReviewTypes";

const FILL_ALL_POLL_MS = 1000;
const FILL_ALL_POLL_MAX = 60 * 30; // ~30 min at 1s

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFillAllInFlight(status: FillAllRunStatus["status"]): boolean {
  return status === "queued" || status === "running";
}

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
    update,
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

  let fillAllBaselineOrphan: number | null = null;

  async function refreshDraftsAndCoverage(): Promise<ClaimCoverage | null> {
    if (!jobId) return null;
    try {
      const [draftsNext, coverage] = await Promise.all([
        listJobDrafts(jobId),
        getJobClaimCoverage(jobId).catch(() => null),
      ]);
      setDrafts(draftsNext);
      if (coverage) setClaimCoverage(coverage);
      setDirty(false);
      setRegenNonce((n) => n + 1);
      return coverage;
    } catch {
      /* keep prior drafts on poll refresh failure */
      return null;
    }
  }

  function reportFillAllProgress(coverage: ClaimCoverage | null) {
    if (!update || !coverage) return;
    const orphan = coverage.summary.orphan;
    if (fillAllBaselineOrphan == null) {
      fillAllBaselineOrphan = Math.max(orphan, 1);
    }
    const baseline = fillAllBaselineOrphan;
    const filled = Math.max(0, baseline - orphan);
    const percent = Math.min(100, Math.round((filled / baseline) * 100));
    update({
      label: `Filling orphan claims… ${filled}/${baseline}`,
      mode: "determinate",
      percent,
    });
  }

  function noticeFromFillOutput(
    output: FillAllRunStatus["output"],
    orphanFallback: number,
  ) {
    const filled = output?.filled ?? 0;
    const remaining = output?.remaining ?? orphanFallback;
    const stop = output?.stopReason;
    if (stop === "capacity" || (filled === 0 && remaining > 0)) {
      setNotice({
        message:
          remaining > 0
            ? `Filled ${filled}; ${remaining} still orphan (capacity)`
            : "Could not fill orphans right now; try again later",
        tone: "info",
      });
      return;
    }
    if (remaining > 0) {
      setNotice({
        message: `Filled ${filled}; ${remaining} still orphan`,
        tone: "info",
      });
      return;
    }
    if (filled > 0) {
      setNotice({
        message: `Filled ${filled} orphan claim${filled === 1 ? "" : "s"}`,
        tone: "info",
      });
      return;
    }
    setNotice({ message: "No orphan claims to fill", tone: "info" });
  }

  let fillAllSession = 0;

  async function pollFillAllUntilDone(session: number) {
    if (!jobId) return;
    for (let i = 0; i < FILL_ALL_POLL_MAX; i += 1) {
      if (session !== fillAllSession) return;
      let status: FillAllRunStatus;
      try {
        status = await getFillAllOrphansStatus(jobId);
      } catch {
        await sleep(FILL_ALL_POLL_MS);
        continue;
      }
      const coverage = await refreshDraftsAndCoverage();
      reportFillAllProgress(coverage);
      if (!isFillAllInFlight(status.status)) {
        if (session !== fillAllSession) return;
        if (status.status === "errored" || status.status === "terminated") {
          setError(
            status.status === "errored"
              ? "Fill-all stopped with an error; partial fills kept"
              : "Fill-all was interrupted; partial fills kept",
          );
          noticeFromFillOutput(status.output, status.output?.remaining ?? 0);
          end(false);
          return;
        }
        if (status.status === "idle" && !status.output) {
          setNotice({
            message: "Fill-all finished; refresh if orphans remain",
            tone: "info",
          });
          end();
          return;
        }
        noticeFromFillOutput(status.output, status.output?.remaining ?? 0);
        if (status.output?.stopReason === "error") {
          setError("Fill-all stopped early; partial fills kept");
          end(false);
          return;
        }
        end();
        return;
      }
      await sleep(FILL_ALL_POLL_MS);
    }
    if (session !== fillAllSession) return;
    setNotice({
      message: "Fill-all is still running; refresh to check progress",
      tone: "info",
    });
    end();
  }

  async function runFillAllPollSession() {
    const session = ++fillAllSession;
    fillAllBaselineOrphan = null;
    setFillAllBusy(true);
    setCardRegenBusy(true);
    begin("Filling orphan claims…");
    try {
      await pollFillAllUntilDone(session);
    } finally {
      if (session === fillAllSession) {
        setFillAllBusy(false);
        setCardRegenBusy(false);
        fillAllBaselineOrphan = null;
      }
    }
  }

  async function onFillAllOrphans() {
    if (!jobId || generatingClaimId || fillAllBusy || busy || cardRegenBusy) {
      return;
    }
    setError(null);
    setNotice(null);
    fillAllBaselineOrphan = null;
    setFillAllBusy(true);
    setCardRegenBusy(true);
    begin("Filling orphan claims…");
    const session = ++fillAllSession;
    try {
      const kickoff = await generateCardsFromOrphanClaims(jobId);
      if (kickoff.kind === "empty") {
        noticeFromFillOutput(
          {
            attempted: kickoff.attempted,
            filled: kickoff.filled,
            skipped: kickoff.skipped,
            remaining: kickoff.remaining,
            stopReason: "empty",
          },
          kickoff.remaining,
        );
        end();
        return;
      }
      await pollFillAllUntilDone(session);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await pollFillAllUntilDone(session);
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not fill orphan claims",
      );
      end(false);
    } finally {
      if (session === fillAllSession) {
        setFillAllBusy(false);
        setCardRegenBusy(false);
        fillAllBaselineOrphan = null;
      }
    }
  }

  /**
   * Resume busy+poll if a Fill-all Workflow is already in flight (remount).
   * @returns true when an in-flight run was attached (or busy already owns it).
   */
  async function resumeFillAllIfRunning(): Promise<boolean> {
    if (!jobId) return false;
    if (fillAllBusy) return true;
    if (generatingClaimId || busy || cardRegenBusy) return false;
    try {
      const status = await getFillAllOrphansStatus(jobId);
      if (!isFillAllInFlight(status.status)) return false;
      await runFillAllPollSession();
      return true;
    } catch {
      return false;
    }
  }

  return {
    onRegenThisCard,
    onRegen,
    onDismissFailed,
    onGenerateOrphan,
    onFillAllOrphans,
    resumeFillAllIfRunning,
  };
}
