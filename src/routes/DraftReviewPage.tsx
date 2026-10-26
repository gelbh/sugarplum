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
import JourneyRail from "../components/JourneyRail";
import JourneyNextButton from "../components/JourneyNextButton";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import {
  ApiError,
  acceptCard,
    getJob,
    getJourney,
  listJobDrafts,
  me,
  patchCard,
  rejectCard,
  type CardDraftView,
} from "../api/client";
import { deriveJourney } from "../journey/derive";
import type { JourneyView } from "../journey/types";

function jobIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/jobs\/([^/]+)\/drafts\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

const TERMINAL_OK = new Set(["needs_review", "done"]);
const TERMINAL_FAIL = new Set(["failed"]);

async function waitForJobReady(jobId: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const job = await getJob(jobId);
    if (TERMINAL_OK.has(job.status)) return;
    if (TERMINAL_FAIL.has(job.status)) {
      throw new ApiError(400, job.error ?? "Generation failed");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new ApiError(408, "Timed out waiting for generation");
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
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const list = await listJobDrafts(id);
    setDrafts(list);
    setIndex(0);
    setDirty(false);
    return list;
  }, []);

  const refreshJourney = useCallback(async (id: string, draftCount: number) => {
    try {
      const journey = await getJourney();
      const derived = deriveJourney(journey);
      if (draftCount > 0) {
        derived.collapsed = false;
        derived.next = {
          label: "Review drafts",
          href: `/jobs/${id}/drafts`,
          action: "review",
        };
        derived.stages = derived.stages.map((s) => ({
          ...s,
          active: s.id === "review",
        }));
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
        setStatusLine("Waiting for generation…");
        await waitForJobReady(jobId);
        if (cancelled) return;
        setStatusLine(null);
        const list = await load(jobId);
        if (!cancelled) await refreshJourney(jobId, list.length);
        if (!cancelled) setReady(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setStatusLine(null);
        setError(
          err instanceof ApiError ? err.message : "Failed to load drafts",
        );
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, load, refreshJourney]);

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
    setBusy(true);
    try {
      const updated = await patchCard(current.id, {
        front: current.front,
        back: current.back,
        type: current.type === "cloze" ? "cloze" : "qa",
      });
      setDrafts((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      setDirty(false);
      setNotice("Saved edits");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function onAccept() {
    if (!current || !jobId) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (dirty) {
        await patchCard(current.id, {
          front: current.front,
          back: current.back,
          type: current.type === "cloze" ? "cloze" : "qa",
        });
      }
      await acceptCard(current.id);
      const list = await load(jobId);
      await refreshJourney(jobId, list.length);
      setNotice("Card accepted into study");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept");
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    if (!current || !jobId) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await rejectCard(current.id);
      const list = await load(jobId);
      await refreshJourney(jobId, list.length);
      setNotice("Card rejected");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reject");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography color="text.secondary">
          {statusLine ?? "Loading drafts…"}
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={2}>
        {view ? <JourneyRail view={view} /> : null}
        {journeyError ? (
          <Alert severity="warning">{journeyError}</Alert>
        ) : null}
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

        {!current ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography>No drafts left for this job.</Typography>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
              {view ? <JourneyNextButton view={view} /> : <Link href="/library">Back to library</Link>}
            </Box>
          </Paper>
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
                label={current.type === "cloze" ? "Cloze" : "Q&A"}
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
                  Source: {String((current.provenance as { excerpt: string }).excerpt)}
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
              <Button variant="text" onClick={onSave} disabled={busy || !dirty}>
                Save
              </Button>
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
