import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DraftCardEditor from "../components/DraftCardEditor";
import JourneyRail from "../components/JourneyRail";
import JourneyNextButton from "../components/JourneyNextButton";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import {
  ApiError,
  acceptAllJobDrafts,
  acceptCard,
  getJob,
  getJourney,
  listJobDrafts,
  me,
  patchCard,
  regenJob,
  rejectCard,
  type CardDraftView,
  type CardType,
} from "../api/client";
import { deriveJourney } from "../journey/derive";
import { forceOpenDraftReview } from "../journey/forceOpenDraftReview";
import type { JourneyView } from "../journey/types";
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

function draftTypeLabel(type: CardDraftView["type"]): string {
  if (type === "occlusion") return "Occlusion";
  if (type === "cloze") return "Cloze";
  if (type === "mcq") return "Multiple choice";
  if (type === "image_label") return "Image label";
  if (type === "diagram") return "Diagram";
  return "Q&A";
}

/** Operate UI: review, edit, accept or reject generation drafts (code-led MUI; no Impeccable comps). */
export default function DraftReviewPage() {
  const jobId = jobIdFromPath();
  const [drafts, setDrafts] = useState<CardDraftView[]>([]);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<JourneyView | null>(null);
  const [journeyError, setJourneyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  /** When false, drop jobId from useJobProgress so the same id can remount and poll again after regen. */
  const [progressGate, setProgressGate] = useState(true);
  const [coverage, setCoverage] = useState<{
    covered: string[];
    gaps: string[];
    draft_count?: number;
  } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const jobProgress = useJobProgress(authReady && progressGate ? jobId : null);
  const { begin: beginLoad, end: endLoad } = useTrackedOp("Loading drafts…");
  const { busy, begin, end } = useTrackedOp("Working…");

  useEffect(() => {
    if (!progressGate && authReady && jobId) {
      setProgressGate(true);
    }
  }, [progressGate, authReady, jobId]);

  const load = useCallback(async (id: string) => {
    const [list, job] = await Promise.all([listJobDrafts(id), getJob(id)]);
    setDrafts(list);
    setIndex(0);
    setDirty(false);
    if (job.coverage_json) {
      try {
        const parsed = JSON.parse(job.coverage_json) as {
          covered?: string[];
          gaps?: string[];
          draft_count?: number;
        };
        setCoverage({
          covered: Array.isArray(parsed.covered) ? parsed.covered : [],
          gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
          draft_count: parsed.draft_count,
        });
      } catch {
        setCoverage(null);
      }
    } else {
      setCoverage(null);
    }
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
      }
      setJourneyError(null);
      setView(derived);
    } catch (err) {
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

  const current = drafts[index] ?? null;

  function onEditorChange(
    next: Pick<CardDraftView, "front" | "back" | "type" | "options">,
  ) {
    if (!current) return;
    setDrafts((prev) =>
      prev.map((c) => (c.id === current.id ? { ...c, ...next } : c)),
    );
    setDirty(true);
  }

  async function onSave() {
    if (!current || !dirty) return;
    setError(null);
    setNotice(null);
    begin();
    try {
      const updated = await patchCard(current.id, cardPatchBody(current));
      setDrafts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setDirty(false);
      setNotice("Saved edits");
      end();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
      end(false);
    }
  }

  async function onAccept() {
    if (!current || !jobId) return;
    setError(null);
    setNotice(null);
    begin();
    try {
      if (dirty) {
        await patchCard(current.id, cardPatchBody(current));
      }
      await acceptCard(current.id);
      const list = await load(jobId);
      await refreshJourney(jobId, list.length);
      setNotice("Card accepted into study");
      end();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept");
      end(false);
    }
  }

  async function onReject() {
    if (!current || !jobId) return;
    setError(null);
    setNotice(null);
    begin();
    try {
      await rejectCard(current.id);
      const list = await load(jobId);
      await refreshJourney(jobId, list.length);
      setNotice("Card rejected");
      end();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reject");
      end(false);
    }
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
      const list = await load(jobId);
      await refreshJourney(jobId, list.length);
      if (result.failed > 0) {
        setNotice(
          `Accepted ${result.accepted}; ${result.failed} could not be accepted`,
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

  async function onRegen() {
    if (!jobId) return;
    setError(null);
    setNotice(null);
    setConfirmRegen(false);
    begin();
    try {
      await regenJob(jobId);
      setDrafts([]);
      setCoverage(null);
      setIndex(0);
      setDirty(false);
      setReady(false);
      setProgressGate(false);
      end();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not regenerate");
      end(false);
    }
  }

  const regenDisabled = busy || jobProgress.pending;

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
        {notice ? <Alert severity="success">{notice}</Alert> : null}

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

        {!current ? (
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              bgcolor: "background.paper",
              borderColor: "divider",
            }}
          >
            <Stack spacing={2}>
              <Typography>No drafts left for this job.</Typography>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                {view ? (
                  <JourneyNextButton view={view} />
                ) : (
                  <Link href="/library" color="text.secondary">
                    Back to library
                  </Link>
                )}
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => setConfirmRegen(true)}
                  disabled={regenDisabled}
                >
                  Regenerate
                </Button>
              </Stack>
            </Stack>
          </Paper>
        ) : (
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              bgcolor: "background.paper",
              borderColor: "divider",
            }}
          >
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 2 }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Card {index + 1} of {drafts.length}
              </Typography>
              <Chip
                size="small"
                label={draftTypeLabel(current.type)}
                color="primary"
                variant="outlined"
              />
            </Stack>

            <DraftCardEditor
              card={current}
              disabled={busy}
              onChange={onEditorChange}
            />

            {current.provenance &&
            typeof current.provenance === "object" &&
            "excerpt" in current.provenance ? (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary">
                  Source:{" "}
                  {String((current.provenance as { excerpt: string }).excerpt)}
                </Typography>
              </>
            ) : null}

            <Stack
              spacing={1.5}
              sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: "divider" }}
            >
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<CheckIcon />}
                  onClick={onAccept}
                  disabled={busy}
                >
                  Accept
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<CloseIcon />}
                  onClick={onReject}
                  disabled={busy}
                >
                  Reject
                </Button>
              </Stack>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={() => setConfirmAll(true)}
                  disabled={busy || drafts.length === 0}
                >
                  Approve all
                </Button>
              </Stack>
              <Stack
                direction="row"
                spacing={1.5}
                flexWrap="wrap"
                useFlexGap
                alignItems="center"
                sx={{ pt: 1, borderTop: 1, borderColor: "divider" }}
              >
                <Button
                  variant="text"
                  onClick={onSave}
                  disabled={busy || !dirty}
                  startIcon={<CheckIcon />}
                >
                  Save
                </Button>
                <Button
                  variant="text"
                  disabled={busy || index <= 0}
                  onClick={() => {
                    setIndex((i) => Math.max(0, i - 1));
                    setDirty(false);
                    setNotice(null);
                  }}
                >
                  Previous
                </Button>
                <Button
                  variant="text"
                  disabled={busy || index >= drafts.length - 1}
                  onClick={() => {
                    setIndex((i) => Math.min(drafts.length - 1, i + 1));
                    setDirty(false);
                    setNotice(null);
                  }}
                >
                  Next
                </Button>
              </Stack>
              <Box>
                <Button
                  variant="text"
                  color="error"
                  onClick={() => setConfirmRegen(true)}
                  disabled={regenDisabled}
                >
                  Regenerate
                </Button>
              </Box>
            </Stack>
          </Paper>
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
          open={confirmRegen}
          onClose={() => !busy && setConfirmRegen(false)}
        >
          <DialogTitle>Regenerate this job?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This deletes all cards from this job, including any you already
              accepted into study, then regenerates from the material.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmRegen(false)} disabled={busy}>
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
