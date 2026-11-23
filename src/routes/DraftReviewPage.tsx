import { useEffect, useRef, useState } from "react";
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
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import HighlightOffRoundedIcon from "@mui/icons-material/HighlightOffRounded";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useUnlockToasts } from "../achievements/UnlockToastProvider";
import { ReviewCard } from "../study";
import {
  asRegenType,
  cardHasRegenSource,
  getJob,
  type CardDraftView,
  type ClaimCoverage,
} from "../api/client";
import {
  CreateFlowNoticeFade,
  NoticeUndoButton,
} from "../library/CreateFlowNotice";
import StageBreadcrumbs, { type StageCrumb } from "../shared/ui/StageBreadcrumbs";
import { type EmptyJobDraftCtas } from "../journey/emptyJobDraftCtas";
import JobProgressPanel from "../progress/JobProgressPanel";
import { useJobProgress } from "../progress/useJobProgress";
import { useTrackedOp } from "../progress/useTrackedOp";
import { useSession } from "../session/SessionContext";
import {
  BATCH_PILL_BASE,
  DIALOG_CANCEL_SX,
  DIALOG_PAPER_SX,
  DIALOG_TITLE_SX,
  PRIMARY_PILL_SX,
} from "../draftReview";
import DialogEyebrow from "../shared/ui/DialogEyebrow";
import { jobIdFromPath } from "../draftReview";
import { createDraftReviewBatch } from "../draftReview";
import { createDraftReviewDecide } from "../draftReview";
import { createDraftReviewRegen } from "../draftReview";
import type { DraftReviewNotice } from "../draftReview";
import { friendlyJobError } from "../draftReview";
import { ClaimCoveragePanel } from "../draftReview";
import { useDraftReviewLoad } from "../draftReview";
import EnrichmentBanner from "../draftReview/EnrichmentBanner";
import { shouldShowEnrichmentBanner } from "../draftReview/enrichmentBannerVisibility";

const ENRICH_POLL_MS = 1_500;

export default function DraftReviewPage() {
  const jobId = jobIdFromPath();
  const [drafts, setDrafts] = useState<CardDraftView[]>([]);
  const [regenNonce, setRegenNonce] = useState(0);
  const [emptyCtas, setEmptyCtas] = useState<EmptyJobDraftCtas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<DraftReviewNotice | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [claimCoverage, setClaimCoverage] = useState<ClaimCoverage | null>(
    null,
  );
  const [claimSpanGaps, setClaimSpanGaps] = useState<string[]>([]);
  const [crumbs, setCrumbs] = useState<StageCrumb[]>([
    { label: "Library", href: "/library" },
  ]);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmRejectDrafts, setConfirmRejectDrafts] = useState(false);
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);
  const [cardRegenBusy, setCardRegenBusy] = useState(false);
  const [generatingClaimId, setGeneratingClaimId] = useState<string | null>(
    null,
  );
  const [fillAllBusy, setFillAllBusy] = useState(false);
  /** When false, drop jobId from useJobProgress so the same id can remount and poll again after regen. */
  const [progressGate, setProgressGate] = useState(true);
  const [enrichProgress, setEnrichProgress] = useState<{
    stage: string | null;
    current: number | null;
    total: number | null;
    percent: number | null;
  }>({ stage: null, current: null, total: null, percent: null });
  const [enrichPollDone, setEnrichPollDone] = useState(false);
  const { user } = useSession();
  const jobProgress = useJobProgress(user && progressGate ? jobId : null);
  const { begin: beginLoad, end: endLoad } = useTrackedOp("Loading drafts…");
  const { busy, begin, end, update } = useTrackedOp("Working…");
  const { enqueueUnlocks } = useUnlockToasts();

  useEffect(() => {
    if (!progressGate && jobId) {
      setProgressGate(true);
    }
  }, [progressGate, jobId]);

  useEffect(() => {
    setEnrichProgress({
      stage: null,
      current: null,
      total: null,
      percent: null,
    });
    setEnrichPollDone(false);
  }, [jobId]);

  useEffect(() => {
    const snap = jobProgress.snapshot;
    if (!snap) return;
    setEnrichProgress({
      stage: snap.stage ?? null,
      current: snap.current ?? null,
      total: snap.total ?? null,
      percent: typeof snap.percent === "number" ? snap.percent : null,
    });
  }, [jobProgress.snapshot]);

  const { load, refreshJourney } = useDraftReviewLoad({
    jobId,
    jobProgressReady: jobProgress.ready,
    jobProgressError: jobProgress.error,
    beginLoad,
    endLoad,
    setDrafts,
    setEmptyCtas,
    setError,
    setJobStatus,
    setCrumbs,
    setReady,
    setDirty,
    setClaimCoverage,
    setClaimSpanGaps,
  });

  const showEnrichmentBanner = shouldShowEnrichmentBanner({
    jobStatus,
    stage: enrichProgress.stage,
    current: enrichProgress.current,
    total: enrichProgress.total,
  });

  // useJobProgress settles on needs_review; keep a light getJob poll while
  // enrich may still run so the banner and gap-fill drafts stay honest.
  // Include stage===enrich even after the banner hides so one final tick can reload drafts.
  const pollEnrichProgress =
    ready &&
    Boolean(jobId) &&
    jobStatus === "needs_review" &&
    !enrichPollDone &&
    (showEnrichmentBanner ||
      enrichProgress.stage === "enrich" ||
      enrichProgress.stage === "persist" ||
      enrichProgress.stage == null);

  useEffect(() => {
    if (!pollEnrichProgress || !jobId) return;
    let cancelled = false;
    let inFlight = false;
    let sawEnrichBanner = false;
    let idleWaitingForEnrich = 0;
    let nextTimer: ReturnType<typeof setTimeout> | undefined;
    /** ~30s of persist/null with no enrich → stop (gap-fill skipped). */
    const IDLE_ENRICH_TICKS = 20;
    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      let keepPolling = true;
      try {
        const job = await getJob(jobId);
        if (cancelled) return;
        setJobStatus(job.status);
        const progress = job.progress;
        setEnrichProgress({
          stage: progress?.stage ?? null,
          current: progress?.current ?? null,
          total: progress?.total ?? null,
          percent:
            typeof progress?.percent === "number" ? progress.percent : null,
        });
        const showBanner = shouldShowEnrichmentBanner({
          jobStatus: job.status,
          stage: progress?.stage,
          current: progress?.current,
          total: progress?.total,
        });
        if (showBanner) {
          sawEnrichBanner = true;
          idleWaitingForEnrich = 0;
        } else if (progress?.stage === "enrich") {
          idleWaitingForEnrich = 0;
        } else {
          idleWaitingForEnrich += 1;
        }
        const enrichJustFinished =
          sawEnrichBanner && !showBanner && job.status === "needs_review";
        // Skip draft reload while the user has unsaved edits (incl. mid-flight).
        if (!dirtyRef.current && (showBanner || enrichJustFinished)) {
          await load(jobId, () => !dirtyRef.current);
        }
        if (
          enrichJustFinished ||
          (!sawEnrichBanner && idleWaitingForEnrich >= IDLE_ENRICH_TICKS)
        ) {
          keepPolling = false;
          setEnrichPollDone(true);
        }
      } catch {
        // Transient poll failures should not block review.
      } finally {
        inFlight = false;
        if (!cancelled && keepPolling) {
          nextTimer = setTimeout(() => {
            void tick();
          }, ENRICH_POLL_MS);
        }
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (nextTimer) clearTimeout(nextTimer);
    };
  }, [pollEnrichProgress, jobId, load]);

  const current = drafts[0] ?? null;

  const jumpToDraft = (cardId: string) => {
    if (dirty) return;
    let moved = false;
    setDrafts((prev) => {
      const idx = prev.findIndex((d) => d.id === cardId);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [card] = next.splice(idx, 1);
      if (!card) return prev;
      next.unshift(card);
      moved = true;
      return next;
    });
    if (moved) setRegenNonce((n) => n + 1);
  };

  const { onEditorChange, onUndoDecision, onDecide } = createDraftReviewDecide({
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
  });

  const { onAcceptAll, onRejectRemainingDrafts } = createDraftReviewBatch({
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
  });

  const {
    onRegenThisCard,
    onRegen,
    onDismissFailed,
    onGenerateOrphan,
    onFillAllOrphans,
    resumeFillAllIfRunning,
  } = createDraftReviewRegen({
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
    });

  const fillAllResumeAttachedRef = useRef(false);
  useEffect(() => {
    fillAllResumeAttachedRef.current = false;
  }, [jobId]);
  useEffect(() => {
    if (fillAllResumeAttachedRef.current) return;
    if (!jobId || !claimCoverage || claimCoverage.summary.orphan <= 0) return;
    let cancelled = false;
    void (async () => {
      const attached = await resumeFillAllIfRunning();
      if (!cancelled && attached) fillAllResumeAttachedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, claimCoverage, resumeFillAllIfRunning]);

  const jobActionDisabled = busy || jobProgress.pending;
  const failedEmpty = !current && jobStatus === "failed";
  const storageMiss =
    typeof error === "string" &&
    (error.includes("not found in storage") ||
      error.startsWith("R2 object missing:"));

  const stageShellSx = {
    flex: 1,
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    color: "var(--sp-ivory)",
    overflow: "hidden",
    boxSizing: "border-box",
    "& .MuiIconButton-root": { color: "var(--sp-ivory)" },
  } as const;

  const pageSx = {
    flex: 1,
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    py: { xs: 1, md: 1.5 },
    overflow: "hidden",
  } as const;

  if (!ready) {
    return (
      <Box className="sp-stage" sx={stageShellSx}>
        <Container
          maxWidth="sm"
          sx={{ ...pageSx, justifyContent: "center", overflow: "auto" }}
        >
          {jobId && !jobProgress.error ? (
            <JobProgressPanel snapshot={jobProgress.snapshot} />
          ) : (
            <Typography sx={{ opacity: 0.72 }}>Loading drafts…</Typography>
          )}
        </Container>
      </Box>
    );
  }

  return (
    <Box className="sp-stage" sx={stageShellSx}>
      <Container maxWidth="sm" sx={pageSx}>
        <Stack
          spacing={1}
          sx={{
            width: "100%",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <Stack spacing={0.75} sx={{ flexShrink: 0 }}>
            <StageBreadcrumbs crumbs={crumbs} />
            <Box>
              <Typography
                variant="h4"
                component="h1"
                sx={{
                  m: 0,
                  fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
                  fontWeight: 400,
                  letterSpacing: "0.02em",
                  lineHeight: 1.15,
                  color: "var(--sp-ivory)",
                }}
              >
                Draft review
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  mt: 0.75,
                  maxWidth: "42ch",
                  lineHeight: 1.45,
                  color: "rgba(232, 216, 199, 0.72)",
                }}
              >
                Edit before cards enter study. Drafts never appear in due until
                accepted.
              </Typography>
            </Box>
          </Stack>

          {error && !failedEmpty ? (
            <Alert
              severity="error"
              onClose={() => setError(null)}
              sx={{ flexShrink: 0 }}
            >
              {error}
            </Alert>
          ) : null}
          {showEnrichmentBanner ? (
            <EnrichmentBanner percent={enrichProgress.percent} />
          ) : null}
          <Box sx={{ flexShrink: 0 }}>
            <CreateFlowNoticeFade
              open={notice != null}
              tone={notice?.tone ?? "info"}
              stage
              onClose={() => setNotice(null)}
              action={
                notice?.undoCardId ? (
                  <NoticeUndoButton
                    disabled={undoBusy || busy}
                    onClick={() => {
                      void onUndoDecision();
                    }}
                  />
                ) : undefined
              }
            >
              {notice?.message ?? ""}
            </CreateFlowNoticeFade>
          </Box>

          {!current &&
          jobStatus === "needs_review" &&
          claimCoverage &&
          (claimCoverage.summary.total > 0 || claimSpanGaps.length > 0) ? (
            <Box sx={{ width: "100%", mb: 2 }}>
              <ClaimCoveragePanel
                coverage={claimCoverage}
                drafts={drafts}
                claimSpanGaps={claimSpanGaps}
                onJumpToDraft={jumpToDraft}
                onGenerateOrphan={(claimId) => {
                  void onGenerateOrphan(claimId);
                }}
                onFillAllOrphans={() => {
                  void onFillAllOrphans();
                }}
                generatingClaimId={generatingClaimId}
                fillAllBusy={fillAllBusy}
                generateDisabled={
                  busy ||
                  cardRegenBusy ||
                  dirty ||
                  generatingClaimId != null ||
                  fillAllBusy
                }
              />
            </Box>
          ) : null}

          {!current ? (
            <Box
              sx={{
                borderRadius: 2.5,
                border: "1px solid",
                borderColor: "rgba(232, 216, 199, 0.18)",
                bgcolor: "rgba(18, 7, 15, 0.35)",
                px: { xs: 2.25, sm: 3 },
                py: { xs: 2.5, sm: 3 },
              }}
            >
              <Stack spacing={2.25} sx={{
                alignItems: "flex-start"
              }}>
                {failedEmpty ? (
                  <>
                    <Box>
                      <Typography
                        variant="h6"
                        sx={{
                          m: 0,
                          fontFamily:
                            '"Alice", "Georgia", "Times New Roman", serif',
                          fontWeight: 400,
                          letterSpacing: "0.02em",
                          lineHeight: 1.25,
                        }}
                      >
                        No cards to review
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          mt: 1,
                          maxWidth: "40ch",
                          lineHeight: 1.55,
                          color: "rgba(232, 216, 199, 0.72)",
                        }}
                      >
                        {storageMiss
                          ? "The uploaded file never landed in storage this Worker can read. Discard and upload again, or try again once remote R2 is connected."
                          : (friendlyJobError(error) ??
                            "Generation did not produce any cards you can review.")}
                      </Typography>
                    </Box>
                    <Stack
                      direction="row"
                      spacing={1.25}
                      useFlexGap
                      sx={{
                        flexWrap: "wrap",
                        pt: 0.5
                      }}>
                      <Button
                        variant="contained"
                        onClick={() => setRegenConfirmOpen(true)}
                        disabled={jobActionDisabled}
                        sx={PRIMARY_PILL_SX}
                      >
                        Try again
                      </Button>
                      <Button
                        variant="outlined"
                        color="inherit"
                        onClick={() => {
                          void onDismissFailed();
                        }}
                        disabled={jobActionDisabled}
                        sx={{
                          ...PRIMARY_PILL_SX,
                          borderColor: "rgba(232, 216, 199, 0.28)",
                          bgcolor: "transparent",
                        }}
                      >
                        Discard
                      </Button>
                    </Stack>
                  </>
                ) : (
                  <>
                    <Box>
                      <Typography
                        variant="h6"
                        sx={{
                          m: 0,
                          fontFamily:
                            '"Alice", "Georgia", "Times New Roman", serif',
                          fontWeight: 400,
                          letterSpacing: "0.02em",
                          lineHeight: 1.25,
                        }}
                      >
                        {fillAllBusy ? "Filling orphan claims" : "No drafts left"}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          mt: 1,
                          maxWidth: "40ch",
                          lineHeight: 1.55,
                          color: "rgba(232, 216, 199, 0.72)",
                        }}
                      >
                        {fillAllBusy
                          ? "New drafts will appear here as claims are filled. Coverage above tracks progress."
                          : "This job is clear. Start study, open other drafts, or regenerate from the same material."}
                      </Typography>
                    </Box>
                    {!fillAllBusy ? (
                      <Stack
                        direction="row"
                        spacing={1.25}
                        useFlexGap
                        sx={{
                          flexWrap: "wrap",
                          pt: 0.5,
                        }}
                      >
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
                              sx={PRIMARY_PILL_SX}
                            >
                              {emptyCtas.primary.label}
                            </Button>
                            {emptyCtas.otherDrafts ? (
                              <Button
                                variant="outlined"
                                href={emptyCtas.otherDrafts.href}
                                sx={{
                                  ...PRIMARY_PILL_SX,
                                  borderColor: "rgba(232, 216, 199, 0.28)",
                                  bgcolor: "transparent",
                                  color: "var(--sp-ivory)",
                                }}
                              >
                                {emptyCtas.otherDrafts.label}
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          <Link
                            href="/library"
                            sx={{ color: "rgba(232, 216, 199, 0.72)" }}
                          >
                            Back to library
                          </Link>
                        )}
                        <Button
                          variant="text"
                          color="inherit"
                          onClick={() => setRegenConfirmOpen(true)}
                          disabled={jobActionDisabled}
                          sx={{
                            color: "rgba(232, 216, 199, 0.72)",
                            textTransform: "none",
                            fontWeight: 500,
                          }}
                        >
                          Regenerate
                        </Button>
                      </Stack>
                    ) : null}
                  </>
                )}
              </Stack>
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  gap: 1,
                }}
              >
                {jobStatus === "needs_review" &&
                claimCoverage &&
                (claimCoverage.summary.total > 0 ||
                  claimSpanGaps.length > 0) ? (
                  <ClaimCoveragePanel
                    coverage={claimCoverage}
                    drafts={drafts}
                    claimSpanGaps={claimSpanGaps}
                    onJumpToDraft={jumpToDraft}
                    onGenerateOrphan={(claimId) => {
                      void onGenerateOrphan(claimId);
                    }}
                    onFillAllOrphans={() => {
                      void onFillAllOrphans();
                    }}
                    generatingClaimId={generatingClaimId}
                    fillAllBusy={fillAllBusy}
                    generateDisabled={
                      busy ||
                      cardRegenBusy ||
                      dirty ||
                      generatingClaimId != null ||
                      fillAllBusy
                    }
                  />
                ) : null}
                <Box
                  data-card-id={current.id}
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <ReviewCard
                    key={`${current.id}:${regenNonce}`}
                    card={current}
                    remaining={drafts.length}
                    stackBehind={drafts.length > 1}
                    fillHeight
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
                </Box>
                {current.provenance &&
                typeof current.provenance === "object" &&
                "excerpt" in current.provenance ? (
                  <Typography
                    variant="caption"
                    sx={{
                      flexShrink: 0,
                      opacity: 0.65,
                      textAlign: "center",
                      maxWidth: "48ch",
                      alignSelf: "center",
                      lineHeight: 1.3,
                      display: "-webkit-box",
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    Source:{" "}
                    {String(
                      (current.provenance as { excerpt: string }).excerpt,
                    )}
                  </Typography>
                ) : null}
              </Box>

              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{
                  flexWrap: "wrap",
                  justifyContent: "center",
                  flexShrink: 0,
                  pt: 1.25,
                  pb: 0.25,
                  borderTop: "1px solid",
                  borderColor: "rgba(232, 216, 199, 0.12)"
                }}>
                <Button
                  variant="outlined"
                  startIcon={<DoneAllRoundedIcon sx={{ fontSize: 18 }} />}
                  onClick={() => setConfirmAll(true)}
                  disabled={busy || drafts.length === 0}
                  sx={{
                    ...BATCH_PILL_BASE,
                    borderColor: "rgba(209, 163, 226, 0.5)",
                    color: "var(--sp-ivory)",
                    background:
                      "linear-gradient(135deg, rgba(91, 44, 111, 0.42), rgba(18, 7, 15, 0.45))",
                    "&:hover": {
                      boxShadow: "none",
                      borderColor: "rgba(209, 163, 226, 0.72)",
                      background:
                        "linear-gradient(135deg, rgba(91, 44, 111, 0.55), rgba(18, 7, 15, 0.5))",
                    },
                  }}
                >
                  Approve all
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<HighlightOffRoundedIcon sx={{ fontSize: 18 }} />}
                  onClick={() => setConfirmRejectDrafts(true)}
                  disabled={jobActionDisabled || drafts.length === 0}
                  sx={{
                    ...BATCH_PILL_BASE,
                    borderColor: "rgba(240, 180, 188, 0.42)",
                    color: "var(--sp-grade-again-fg, #f0b4bc)",
                    background:
                      "linear-gradient(135deg, rgba(196, 92, 106, 0.18), rgba(18, 7, 15, 0.42))",
                    "&:hover": {
                      boxShadow: "none",
                      borderColor: "rgba(240, 180, 188, 0.62)",
                      background:
                        "linear-gradient(135deg, rgba(196, 92, 106, 0.28), rgba(18, 7, 15, 0.48))",
                    },
                  }}
                >
                  Reject remaining
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<AutorenewRoundedIcon sx={{ fontSize: 18 }} />}
                  onClick={() => setRegenConfirmOpen(true)}
                  disabled={jobActionDisabled}
                  sx={{
                    ...BATCH_PILL_BASE,
                    borderColor: "rgba(232, 216, 199, 0.28)",
                    color: "rgba(232, 216, 199, 0.88)",
                    background:
                      "linear-gradient(135deg, rgba(18, 7, 15, 0.35), rgba(18, 7, 15, 0.5))",
                    "&:hover": {
                      boxShadow: "none",
                      borderColor: "rgba(232, 216, 199, 0.48)",
                      color: "var(--sp-ivory)",
                      background:
                        "linear-gradient(135deg, rgba(18, 7, 15, 0.45), rgba(18, 7, 15, 0.58))",
                    },
                  }}
                >
                  Regenerate
                </Button>
              </Stack>
            </>
          )}

          <Dialog
            open={confirmAll}
            onClose={() => !busy && setConfirmAll(false)}
            fullWidth
            maxWidth="xs"
            slotProps={{
              paper: { sx: DIALOG_PAPER_SX }
            }}
          >
            <Box
              sx={{
                px: 3,
                pt: 2.5,
                pb: 1.5,
                borderBottom: 1,
                borderColor: "divider",
                background:
                  "linear-gradient(180deg, rgba(91, 44, 111, 0.14) 0%, transparent 100%)",
              }}
            >
              <DialogEyebrow label="Approve" />
              <DialogTitle sx={DIALOG_TITLE_SX}>
                Accept all remaining drafts?
              </DialogTitle>
            </Box>
            <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
              <DialogContentText
                sx={{ color: "text.secondary", lineHeight: 1.55, m: 0 }}
              >
                Accept all {drafts.length} remaining drafts into study? This
                accepts every remaining draft without per-card review.
              </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
              <Button
                onClick={() => setConfirmAll(false)}
                disabled={busy}
                sx={DIALOG_CANCEL_SX}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={onAcceptAll}
                disabled={busy}
                autoFocus
                sx={PRIMARY_PILL_SX}
              >
                Confirm
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={confirmRejectDrafts}
            onClose={() => !busy && setConfirmRejectDrafts(false)}
            fullWidth
            maxWidth="xs"
            slotProps={{
              paper: { sx: DIALOG_PAPER_SX }
            }}
          >
            <Box
              sx={{
                px: 3,
                pt: 2.5,
                pb: 1.5,
                borderBottom: 1,
                borderColor: "divider",
                background:
                  "linear-gradient(180deg, rgba(183, 110, 28, 0.12) 0%, transparent 100%)",
              }}
            >
              <DialogEyebrow label="Reject" tone="warning" />
              <DialogTitle sx={DIALOG_TITLE_SX}>
                Reject remaining drafts?
              </DialogTitle>
            </Box>
            <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
              <DialogContentText
                sx={{ color: "text.secondary", lineHeight: 1.55, m: 0 }}
              >
                This rejects remaining drafts for this job only. Cards you
                already accepted stay in study. Nothing is regenerated.
              </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
              <Button
                onClick={() => setConfirmRejectDrafts(false)}
                disabled={busy}
                sx={DIALOG_CANCEL_SX}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                color="warning"
                onClick={onRejectRemainingDrafts}
                disabled={busy}
                autoFocus
                sx={PRIMARY_PILL_SX}
              >
                Reject drafts
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={regenConfirmOpen}
            onClose={() => !busy && setRegenConfirmOpen(false)}
            fullWidth
            maxWidth="xs"
            slotProps={{
              paper: { sx: DIALOG_PAPER_SX }
            }}
          >
            <Box
              sx={{
                px: 3,
                pt: 2.5,
                pb: 1.5,
                borderBottom: 1,
                borderColor: "divider",
                background:
                  "linear-gradient(180deg, rgba(183, 28, 28, 0.12) 0%, transparent 100%)",
              }}
            >
              <DialogEyebrow label="Regenerate" tone="error" />
              <DialogTitle sx={DIALOG_TITLE_SX}>
                Replace all drafts for this job?
              </DialogTitle>
            </Box>
            <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
              <DialogContentText
                sx={{ color: "text.secondary", lineHeight: 1.55, m: 0 }}
              >
                This deletes all cards from this job (drafts and any you already
                accepted into study) and starts generation over from the
                material. To change only one card, use the regenerate button on
                that card instead.
              </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
              <Button
                onClick={() => setRegenConfirmOpen(false)}
                disabled={busy}
                sx={DIALOG_CANCEL_SX}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={onRegen}
                disabled={busy}
                autoFocus
                sx={PRIMARY_PILL_SX}
              >
                Regenerate
              </Button>
            </DialogActions>
          </Dialog>
        </Stack>
      </Container>
    </Box>
  );
}
