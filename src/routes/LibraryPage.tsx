import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  listDecks,
  listJobsWithDrafts,
  me,
  type Deck,
  type JobListItem,
  getJourney,
} from "../api/client";
import { deriveJourney } from "../journey/derive";
import CreateMaterialStepper from "../components/CreateMaterialStepper";
import { useTrackedOp } from "../progress/useTrackedOp";

export default function LibraryPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [draftJobs, setDraftJobs] = useState<JobListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const { end: endLoad } = useTrackedOp("Loading library…", {
    trackOnMount: true,
  });

  const syncStepperFromJourney = useCallback(async () => {
    try {
      const derived = deriveJourney(await getJourney());
      setActiveStep(derived.next.action === "create_deck" ? 0 : 1);
    } catch {
      /* journey is optional for Library */
    }
  }, []);

  const refreshDraftJobs = useCallback(async () => {
    try {
      setDraftJobs(await listJobsWithDrafts());
    } catch {
      /* draft links are optional; decks/stepper still work */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        const [list, jobs] = await Promise.all([
          listDecks(),
          listJobsWithDrafts().catch(() => [] as JobListItem[]),
        ]);
        if (cancelled) return;
        setDecks(list);
        setDraftJobs(jobs);
        setReady(true);
        endLoad();
        try {
          const derived = deriveJourney(await getJourney());
          if (cancelled) return;
          if (derived.next.action === "create_deck") {
            setActiveStep(0);
          } else if (list.length > 0) {
            setActiveStep(1);
          }
        } catch {
          /* ignore */
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Failed to load library",
        );
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad]);

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      {!ready ? (
        <Typography color="text.secondary">Loading library…</Typography>
      ) : (
        <>
          <Typography variant="h4" component="h1" gutterBottom color="primary">
            Library
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create decks, paste notes, or upload PDF, PPTX, or image materials.
          </Typography>

          <Stack spacing={4}>
            {error ? <Alert severity="error">{error}</Alert> : null}

            <Box>
              <Typography variant="h6" component="h2" gutterBottom>
                Your decks
              </Typography>
              {decks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No decks yet. Create one below.
                </Typography>
              ) : (
                <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2 }}>
                  {decks.map((d) => (
                    <Typography component="li" key={d.id} variant="body2">
                      {d.title}
                    </Typography>
                  ))}
                </Stack>
              )}
            </Box>

            {draftJobs.length > 0 ? (
              <Box>
                <Typography variant="h6" component="h2" gutterBottom>
                  Draft reviews
                </Typography>
                <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2 }}>
                  {draftJobs.map((job) => {
                    const filename = job.filename?.trim() || null;
                    const label = filename || job.deck_title;
                    const countLabel =
                      job.draft_count === 1
                        ? "1 draft"
                        : `${job.draft_count} drafts`;
                    const suffix = filename
                      ? ` · ${countLabel} · ${job.deck_title}`
                      : ` · ${countLabel}`;
                    return (
                      <Typography component="li" key={job.id} variant="body2">
                        <Link
                          href={`/jobs/${encodeURIComponent(job.id)}/drafts`}
                          underline="hover"
                        >
                          {label}
                        </Link>
                        {suffix}
                      </Typography>
                    );
                  })}
                </Stack>
              </Box>
            ) : null}

            <CreateMaterialStepper
              decks={decks}
              setDecks={setDecks}
              activeStep={activeStep}
              setActiveStep={setActiveStep}
              onChanged={async () => {
                await syncStepperFromJourney();
                await refreshDraftJobs();
              }}
            />

            <Typography variant="body2">
              <Link href="/today" underline="hover">
                Back home
              </Link>
            </Typography>
          </Stack>
        </>
      )}
    </Container>
  );
}
