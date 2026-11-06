import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useUnlockToasts } from "../achievements/UnlockToastProvider";
import CoverageGapsPanel from "../components/CoverageGapsPanel";
import ReviewCard, { type ReviewDecision } from "../components/ReviewCard";
import OperateSection from "../components/OperateSection";
import JourneyRail from "../components/JourneyRail";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
  ApiError,
  acceptAllJobDrafts,
  acceptCard,
  getJob,
  getJourney,
  listJobDrafts,
  me,
  patchCard,
  asRegenType,
  cardHasRegenSource,
  regenCard,
  regenJob,
  rejectCard,
  rejectJobDrafts,
  type CardDraftView,
  type CardType,
} from "../api/client";
import { deriveJourney } from "../journey/derive";
import {
  emptyJobDraftCtas,
  type EmptyJobDraftCtas,
} from "../journey/emptyJobDraftCtas";
import { forceOpenDraftReview } from "../journey/forceOpenDraftReview";
import type { JourneyView } from "../journey/types";
import type { RejectReason } from "../lib/rejectReasons";
import JobProgressPanel from "../progress/JobProgressPanel";
import { useJobProgress } from "../progress/useJobProgress";
import { useTrackedOp } from "../progress/useTrackedOp";

function jobIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/jobs\/([^/]+)\/drafts\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function cardPatchBody(card: CardDraftView): Parameters<typeof patchCard>[1] {
  const type = card.type as CardType;
  const body: Parameters<typeof patchCard>[1] = {
    front: card.front,
    back: card.back,
    type,
  };
  if (type === "mcq" && card.options) {
    body.options = card.options;
  }
  return body;
}

/** Operate UI: review, edit, accept or reject generation drafts (code-led MUI; no Impeccable comps). */
export default function DraftReviewPage() {
  const jobId = jobIdFromPath();
  const [drafts, setDrafts] = useState<CardDraftView[]>([]);
  const [regenNonce, setRegenNonce] = useState(0);
  const [view, setView] = useState<JourneyView | null>(null);
  const [emptyCtas, setEmptyCtas] = useState<EmptyJobDraftCtas | null>(null);
  const [journeyError, setJourneyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmRejectDrafts, setConfirmRejectDrafts] = useState(false);
  /** Open regen confirm with its hint payload; null when closed. */
  const [regenHints, setRegenHints] = useState<string[] | null>(null);
  const [cardRegenBusy, setCardRegenBusy] = useState(false);
  /** When false, drop jobId from useJobProgress so the same id can remount and poll again after regen. */
  const [progressGate, setProgressGate] = useState(true);
  const [coverage, setCoverage] = useState<{
    covered: string[];
    gaps: string[];
    draft_count?: number;
  } | null>(null);
  const [selectedGaps, setSelectedGaps] = useState<string[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const jobProgress = useJobProgress(authReady && progressGate ? jobId : null);
  const { begin: beginLoad, end: endLoad } = useTrackedOp("Loading drafts…");
  const { busy, begin, end } = useTrackedOp("Working…");
  const { enqueueUnlocks } = useUnlockToasts();

  useEffect(() => {
    if (!progressGate && authReady && jobId) {
      setProgressGate(true);
    }
  }, [progressGate, authReady, jobId]);

  const load = useCallback(async (id: string) => {
    const [list, job] = await Promise.all([listJobDrafts(id), getJob(id)]);
    setDrafts(list);
    setDirty(false);
    let gaps: string[] = [];
    if (job.coverage_json) {
      try {
        const parsed = JSON.parse(job.coverage_json) as {
          covered?: string[];
          gaps?: string[];
          draft_count?: number;
        };
        gaps = Array.isArray(parsed.gaps) ? [...new Set(parsed.gaps)] : [];
        setCoverage({
          covered: Array.isArray(parsed.covered) ? parsed.covered : [],
          gaps,
          draft_count: parsed.draft_count,
        });
      } catch {
        setCoverage(null);
      }
    } else {
      setCoverage(null);
    }
    setSelectedGaps((prev) => prev.filter((g) => gaps.includes(g)));
    return list;
  }, []);

  const refreshJourney = useCallback(async (id: string, draftCount: number) => {
    try {
      const journey = await getJourney();
      let derived = deriveJourney(journey);
      if (draftCount > 0) {
        derived = forceOpenDraftReview(derived);
        derived.next = {
          label: "Review drafts",
          href: `/jobs/${id}/drafts`,
          action: "review",
        };
        setEmptyCtas(null);
      } else {
        setEmptyCtas(
          emptyJobDraftCtas({
            jobId: id,
            openReviewJobId: journey.openReviewJobId,
            dueCount: journey.dueCount,
          }),
        );
      }
      setJourneyError(null);
      setView(derived);
    } catch (err) {
      setEmptyCtas(null);
      setView(null);
      setJourneyError(
        err instanceof ApiError
          ? err.message
          : "Could not load journey progress",
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!jobId) {
        setError("Missing job id in URL");
        setReady(true);
        return;
      }
      try {
        await me();
        if (cancelled) return;
        setAuthReady(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Failed to load drafts",
        );
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    if (jobProgress.error) {
      setError(jobProgress.error);
      setReady(true);
      return;
    }
    if (!jobProgress.ready || !jobId) return;

    let cancelled = false;
    (async () => {
      beginLoad();
      try {
        const list = await load(jobId);
        if (cancelled) return;
        await refreshJourney(jobId, list.length);
        if (cancelled) return;
        setReady(true);
        endLoad();
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load drafts",
        );
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
      endLoad(false);
    };
  }, [
    beginLoad,
    endLoad,
    jobId,
    jobProgress.error,
    jobProgress.ready,
    load,
    refreshJourney,
  ]);

  const current = drafts[0] ?? null;

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
    decidedNotice: string,
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

  async function onAccept(): Promise<boolean> {
    if (!current || !jobId) return false;
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
    await reloadAfterDecision(jobId, current.id, "Card accepted into study");
    return true;
  }

  async function onReject(reason: RejectReason | null): Promise<boolean> {
    if (!current || !jobId) return false;
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
    await reloadAfterDecision(jobId, current.id, "Card rejected");
    return true;
  }

  function onDecide(decision: ReviewDecision, reason: RejectReason | null) {
    return decision === "accept" ? onAccept() : onReject(reason);
  }

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
        setNotice(
          `Accepted ${result.accepted}; ${result.failed} could not be accepted`,
        );
      } else if (result.rejectedSiblingCount > 0) {
        setNotice(
          `Accepted ${result.accepted} cards into study; discarded ${result.rejectedSiblingCount} drafts from other jobs`,
        );
      } else {
        setNotice(`Accepted ${result.accepted} cards into study`);
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
      setNotice(
        result.rejectedCount === 0
          ? "No remaining drafts to reject"
          : `Rejected ${result.rejectedCount} remaining drafts`,
      );
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
      setNotice("Card regenerated");
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
    const hints = regenHints ?? [];
    setRegenHints(null);
    begin();
    try {
      await regenJob(jobId, hints);
      setSelectedGaps([]);
      setDrafts([]);
      setCoverage(null);
      setDirty(false);
      setReady(false);
      setProgressGate(false);
      end();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not regenerate");
      end(false);
    }
  }

  const jobActionDisabled = busy || jobProgress.pending;

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        {jobId && authReady && !jobProgress.error ? (
          <JobProgressPanel snapshot={jobProgress.snapshot} />
        ) : (
          <Typography color="text.secondary">Loading drafts…</Typography>
        )}
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 5 } }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            sx={{ color: "text.primary", fontWeight: 600 }}
          >
            Draft review
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Edit before cards enter study. Drafts never appear in due until
            accepted.
          </Typography>
        </Box>
        {view ? <JourneyRail view={view} /> : null}
        {journeyError ? <Alert severity="warning">{journeyError}</Alert> : null}

        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          sx={{
            pb: 1,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Link href="/library" underline="hover" color="text.secondary">
            Library
          </Link>
          {jobId ? (
            <Typography variant="caption" color="text.secondary">
              Job {jobId.slice(0, 8)}…
            </Typography>
          ) : null}
        </Stack>

        {error ? <Alert severity="error">{error}</Alert> : null}
        {notice ? (
          <Alert
            severity="success"
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              bgcolor: "background.default",
            }}
          >
            {notice}
          </Alert>
        ) : null}

        {coverage && coverage.covered.length > 0 ? (
          <Alert severity="info">
            Draft topics
            {coverage.draft_count != null
              ? ` (${coverage.draft_count} cards)`
              : ""}
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2 }}>
              {coverage.covered.slice(0, 5).map((item) => (
                <Typography component="li" key={item} variant="caption">
                  {item}
                </Typography>
              ))}
            </Box>
          </Alert>
        ) : null}

        {coverage && coverage.gaps.length > 0 ? (
          <CoverageGapsPanel
            gaps={coverage.gaps}
            selected={selectedGaps}
            onSelectedChange={setSelectedGaps}
            disabled={jobActionDisabled}
            onRegenerate={() => setRegenHints(selectedGaps)}
          />
        ) : null}

        {!current ? (
          <OperateSection>
            <Stack spacing={2}>
              <Typography>No drafts left for this job.</Typography>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                {emptyCtas ? (
                  <>
                    <Button
                      variant="contained"
                      color="primary"
                      href={emptyCtas.primary.href}
                      startIcon={
                        emptyCtas.primary.label === "Start study" ? (
                          <PlayArrowIcon />
                        ) : undefined
                      }
                    >
                      {emptyCtas.primary.label}
                    </Button>
                    {emptyCtas.otherDrafts ? (
                      <Button
                        variant="outlined"
                        href={emptyCtas.otherDrafts.href}
                      >
                        {emptyCtas.otherDrafts.label}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <Link href="/library" color="text.secondary">
                    Back to library
                  </Link>
                )}
              </Stack>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <Button
                  variant="text"
                  color="warning"
                  onClick={() => setConfirmRejectDrafts(true)}
                  disabled={jobActionDisabled}
                >
                  Reject remaining drafts
                </Button>
                <Button
                  variant="text"
                  color="error"
                  onClick={() => setRegenHints([])}
                  disabled={jobActionDisabled}
                >
                  Regenerate
                </Button>
              </Stack>
            </Stack>
          </OperateSection>
        ) : (
          <>
            <Box
              className="sp-stage"
              sx={{
                borderRadius: 2,
                border:
                  "1px solid color-mix(in srgb, var(--sp-ivory) 14%, transparent)",
                px: { xs: 1.5, sm: 2.5 },
                py: { xs: 2, sm: 3 },
                color: "var(--sp-ivory)",
                overflow: "hidden",
              }}
            >
              <Stack spacing={2}>
                <ReviewCard
                  key={`${current.id}:${regenNonce}`}
                  card={current}
                  remaining={drafts.length}
                  stackBehind={drafts.length > 1}
                  disabled={busy || cardRegenBusy}
                  onChange={onEditorChange}
                  onDecide={onDecide}
                  regen={{
                    busy: cardRegenBusy,
                    disabled:
                      asRegenType(current.type) === null ||
                      !cardHasRegenSource(current),
                    onClick: () => {
                      void onRegenThisCard();
                    },
                  }}
                />

                {current.provenance &&
                typeof current.provenance === "object" &&
                "excerpt" in current.provenance ? (
                  <Typography
                    variant="caption"
                    sx={{ opacity: 0.7, textAlign: "center" }}
                  >
                    Source:{" "}
                    {String(
                      (current.provenance as { excerpt: string }).excerpt,
                    )}
                  </Typography>
                ) : null}
              </Stack>
            </Box>

            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <Button
                variant="outlined"
                color="primary"
                onClick={() => setConfirmAll(true)}
                disabled={busy || drafts.length === 0}
              >
                Approve all
              </Button>
              <Button
                variant="text"
                color="warning"
                onClick={() => setConfirmRejectDrafts(true)}
                disabled={jobActionDisabled || drafts.length === 0}
              >
                Reject remaining drafts
              </Button>
              <Button
                variant="text"
                color="error"
                onClick={() => setRegenHints([])}
                disabled={jobActionDisabled}
              >
                Regenerate
              </Button>
            </Stack>
          </>
        )}

        <Dialog open={confirmAll} onClose={() => !busy && setConfirmAll(false)}>
          <DialogTitle>Accept all drafts?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Accept all {drafts.length} remaining drafts into study?
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmAll(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={onAcceptAll}
              disabled={busy}
              autoFocus
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={confirmRejectDrafts}
          onClose={() => !busy && setConfirmRejectDrafts(false)}
        >
          <DialogTitle>Reject remaining drafts?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This rejects remaining drafts for this job only. Cards you already
              accepted stay in study. Nothing is regenerated.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setConfirmRejectDrafts(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="warning"
              onClick={onRejectRemainingDrafts}
              disabled={busy}
              autoFocus
            >
              Reject drafts
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={regenHints !== null}
          onClose={() => !busy && setRegenHints(null)}
        >
          <DialogTitle>Replace all drafts for this job?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This deletes all cards from this job (drafts and any you already
              accepted into study) and starts generation over from the material.
              To change only one card, use the regenerate button on that card instead.
              {regenHints && regenHints.length > 0
                ? ` The new drafts will try to cover the ${regenHints.length} selected ${regenHints.length === 1 ? "line" : "lines"}.`
                : ""}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRegenHints(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={onRegen}
              disabled={busy}
              autoFocus
            >
              Regenerate
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </Container>
  );
}
