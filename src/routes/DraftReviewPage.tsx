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
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import HighlightOffRoundedIcon from "@mui/icons-material/HighlightOffRounded";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useUnlockToasts } from "../achievements/UnlockToastProvider";
import ReviewCard, { type ReviewDecision } from "../components/ReviewCard";
import {
  ApiError,
  acceptAllJobDrafts,
  acceptCard,
  dismissJob,
  getJob,
  getJourney,
  listJobDrafts,
  patchCard,
  asRegenType,
  cardHasRegenSource,
  regenCard,
  regenJob,
  rejectCard,
  rejectJobDrafts,
  undoReviewCard,
  type CardDraftView,
  type CardType,
} from "../api/client";
import {
  CreateFlowNoticeFade,
  NoticeUndoButton,
} from "../library/CreateFlowNotice";
import StageBreadcrumbs, { type StageCrumb } from "../library/StageBreadcrumbs";
import {
  emptyJobDraftCtas,
  type EmptyJobDraftCtas,
} from "../journey/emptyJobDraftCtas";
import { REJECT_REASON_LABELS, type RejectReason } from "../lib/rejectReasons";
import { navigate } from "../nav/navigate";
import JobProgressPanel from "../progress/JobProgressPanel";
import { useJobProgress } from "../progress/useJobProgress";
import { useTrackedOp } from "../progress/useTrackedOp";
import { useSession } from "../session/SessionContext";

function jobIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/jobs\/([^/]+)\/drafts\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function friendlyJobError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (
    raw.startsWith("R2 object missing:") ||
    raw.includes("not found in storage")
  ) {
    return "Uploaded file not found in storage. Discard and upload again, or try again after storage is reachable.";
  }
  if (raw.includes("No schema-valid cards")) {
    return "Generation finished without usable cards from this material.";
  }
  return raw;
}

const PRIMARY_PILL_SX = {
  minWidth: 140,
  px: 2.5,
  py: 1.1,
  borderRadius: 999,
  textTransform: "none",
  fontWeight: 600,
  boxShadow: "none",
  "&:hover": { boxShadow: "none" },
} as const;

const BATCH_PILL_BASE = {
  minHeight: 40,
  px: 1.6,
  py: 0.85,
  borderRadius: 999,
  textTransform: "none",
  fontWeight: 600,
  fontSize: "0.8125rem",
  letterSpacing: "0.02em",
  boxShadow: "none",
  border: "1px solid",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  "& .MuiButton-startIcon": { mr: 0.65 },
  "&:hover": { boxShadow: "none" },
  "&.Mui-disabled": {
    opacity: 0.42,
    borderColor: "rgba(232, 216, 199, 0.16)",
    color: "rgba(232, 216, 199, 0.42)",
  },
} as const;

const DIALOG_PAPER_SX = {
  borderRadius: 2,
  overflow: "hidden",
  bgcolor: "background.paper",
} as const;

const DIALOG_TITLE_SX = {
  p: 0,
  fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
  fontWeight: 400,
  letterSpacing: "0.02em",
  lineHeight: 1.2,
  fontSize: "1.65rem",
} as const;

const DIALOG_CANCEL_SX = {
  color: "text.secondary",
  textTransform: "none",
  fontWeight: 500,
  "&:hover": { color: "text.primary", bgcolor: "transparent" },
} as const;

function DialogEyebrow({
  label,
  tone = "primary",
}: {
  label: string;
  tone?: "primary" | "error" | "warning";
}) {
  return (
    <Typography
      component="p"
      sx={{
        m: 0,
        mb: 0.75,
        fontSize: "0.6875rem",
        fontWeight: 500,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: `${tone}.main`,
      }}
    >
      {label}
    </Typography>
  );
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
  const [emptyCtas, setEmptyCtas] = useState<EmptyJobDraftCtas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    message: string;
    tone: "success" | "reject" | "info" | "error";
    undoCardId?: string;
  } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [crumbs, setCrumbs] = useState<StageCrumb[]>([
    { label: "Library", href: "/library" },
  ]);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmRejectDrafts, setConfirmRejectDrafts] = useState(false);
  /** Open regen confirm with its hint payload; null when closed. */
  const [regenHints, setRegenHints] = useState<string[] | null>(null);
  const [cardRegenBusy, setCardRegenBusy] = useState(false);
  /** When false, drop jobId from useJobProgress so the same id can remount and poll again after regen. */
  const [progressGate, setProgressGate] = useState(true);
  const { user } = useSession();
  const jobProgress = useJobProgress(user && progressGate ? jobId : null);
  const { begin: beginLoad, end: endLoad } = useTrackedOp("Loading drafts…");
  const { busy, begin, end } = useTrackedOp("Working…");
  const { enqueueUnlocks } = useUnlockToasts();

  useEffect(() => {
    if (!progressGate && jobId) {
      setProgressGate(true);
    }
  }, [progressGate, jobId]);

  const load = useCallback(async (id: string) => {
    const [list, job] = await Promise.all([listJobDrafts(id), getJob(id)]);
    setDrafts(list);
    setJobStatus(job.status);
    if (job.error) setError(friendlyJobError(job.error));
    setDirty(false);
    const next: StageCrumb[] = [{ label: "Library", href: "/library" }];
    if (job.subject_id && job.subject_title) {
      next.push({
        label: job.subject_title,
        href: `/library/subjects/${encodeURIComponent(job.subject_id)}`,
      });
    }
    if (job.deck_id && job.deck_title) {
      next.push({
        label: job.deck_title,
        href: `/library/decks/${encodeURIComponent(job.deck_id)}`,
      });
    }
    setCrumbs(next);
    return list;
  }, []);

  const refreshJourney = useCallback(async (id: string, draftCount: number) => {
    try {
      if (draftCount > 0) {
        setEmptyCtas(null);
        return;
      }
      const journey = await getJourney();
      setEmptyCtas(
        emptyJobDraftCtas({
          jobId: id,
          openReviewJobId: journey.openReviewJobId,
          dueCount: journey.dueCount,
        }),
      );
    } catch {
      setEmptyCtas(null);
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      setError("Missing job id in URL");
      setReady(true);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    // Failed jobs still need status + drafts so empty UI can offer Discard.
    if (!jobProgress.ready && !jobProgress.error) return;

    let cancelled = false;
    (async () => {
      beginLoad();
      try {
        const list = await load(jobId);
        if (cancelled) return;
        if (jobProgress.error) setError(friendlyJobError(jobProgress.error));
        await refreshJourney(jobId, list.length);
        if (cancelled) return;
        setReady(true);
        endLoad();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : (jobProgress.error ?? "Failed to load drafts"),
        );
        if (jobProgress.error) setJobStatus((prev) => prev ?? "failed");
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
    decidedNotice: {
      message: string;
      tone: "success" | "reject" | "info" | "error";
      undoCardId?: string;
    },
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
    py: { xs: 1.25, md: 2 },
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
          spacing={1.25}
          sx={{
            width: "100%",
            flex: 1,
            minHeight: 0,
            overflow: "auto",
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
              {friendlyJobError(error)}
            </Alert>
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
              <Stack spacing={2.25} alignItems="flex-start">
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
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ pt: 0.5 }}
                    >
                      <Button
                        variant="contained"
                        onClick={() => setRegenHints([])}
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
                        No drafts left
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
                        This job is clear. Start study, open other drafts, or
                        regenerate from the same material.
                      </Typography>
                    </Box>
                    <Stack
                      direction="row"
                      spacing={1.25}
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ pt: 0.5 }}
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
                        onClick={() => setRegenHints([])}
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
                  overflow: "auto",
                  py: 0.5,
                }}
              >
                <Stack
                  spacing={1.5}
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
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
                      sx={{
                        opacity: 0.65,
                        textAlign: "center",
                        maxWidth: "48ch",
                      }}
                    >
                      Source:{" "}
                      {String(
                        (current.provenance as { excerpt: string }).excerpt,
                      )}
                    </Typography>
                  ) : null}
                </Stack>
              </Box>

              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                useFlexGap
                justifyContent="center"
                sx={{
                  flexShrink: 0,
                  pt: 1.25,
                  pb: 0.25,
                  borderTop: "1px solid",
                  borderColor: "rgba(232, 216, 199, 0.12)",
                }}
              >
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
                  onClick={() => setRegenHints([])}
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
            PaperProps={{ sx: DIALOG_PAPER_SX }}
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
            PaperProps={{ sx: DIALOG_PAPER_SX }}
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
            open={regenHints !== null}
            onClose={() => !busy && setRegenHints(null)}
            fullWidth
            maxWidth="xs"
            PaperProps={{ sx: DIALOG_PAPER_SX }}
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
                onClick={() => setRegenHints(null)}
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
