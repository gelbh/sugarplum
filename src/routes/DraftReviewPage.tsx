import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DraftCardEditor from "../components/DraftCardEditor";
import {
  ApiError,
  acceptCard,
  getJob,
  listJobDrafts,
  me,
  patchCard,
  rejectCard,
  type CardDraftView,
} from "../api/client";
import JobProgressPanel from "../progress/JobProgressPanel";
import { useJobProgress } from "../progress/useJobProgress";
import { useTrackedOp } from "../progress/useTrackedOp";

function jobIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/jobs\/([^/]+)\/drafts\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Operate UI: review, edit, accept or reject generation drafts (code-led MUI; no Impeccable comps). */
export default function DraftReviewPage() {
  const jobId = jobIdFromPath();
  const [drafts, setDrafts] = useState<CardDraftView[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [coverage, setCoverage] = useState<{
    covered: string[];
    gaps: string[];
    draft_count?: number;
  } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const jobProgress = useJobProgress(authReady ? jobId : null);
  const { begin: beginLoad, end: endLoad } = useTrackedOp("Loading drafts…");
  const { busy, begin, end } = useTrackedOp("Working…");

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
        await load(jobId);
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
  }, [beginLoad, endLoad, jobId, jobProgress.error, jobProgress.ready, load]);

  const current = drafts[index] ?? null;

  function onEditorChange(
    next: Pick<CardDraftView, "front" | "back" | "type">,
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
      const updated = await patchCard(current.id, {
        front: current.front,
        back: current.back,
        type: current.type as "qa" | "cloze" | "image_label" | "diagram",
      });
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
        await patchCard(current.id, {
          front: current.front,
          back: current.back,
          type: current.type as "qa" | "cloze" | "image_label" | "diagram",
        });
      }
      await acceptCard(current.id);
      await load(jobId);
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
      await load(jobId);
      setNotice("Card rejected");
      end();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reject");
      end(false);
    }
  }

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
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4" component="h1" color="primary" gutterBottom>
            Draft review
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Edit before cards enter study. Drafts never appear in due until
            accepted.
          </Typography>
        </Box>

        <Stack direction="row" spacing={2} alignItems="center">
          <Link href="/library" underline="hover">
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
          <Alert severity="info">
            No drafts left for this job.{" "}
            <Link href="/library">Back to library</Link>
          </Alert>
        ) : (
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mb: 2 }}
            >
              <Typography variant="subtitle1">
                Card {index + 1} of {drafts.length}
              </Typography>
              <Chip
                size="small"
                label={
                  current.type === "cloze"
                    ? "Cloze"
                    : current.type === "image_label"
                      ? "Image label"
                      : current.type === "diagram"
                        ? "Diagram"
                        : "Q&A"
                }
                color="secondary"
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
              direction="row"
              spacing={1.5}
              flexWrap="wrap"
              useFlexGap
              sx={{ mt: 3 }}
            >
              <Button
                variant="outlined"
                onClick={onSave}
                disabled={busy || !dirty}
              >
                Save
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={onAccept}
                disabled={busy}
              >
                Accept
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={onReject}
                disabled={busy}
              >
                Reject
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
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
