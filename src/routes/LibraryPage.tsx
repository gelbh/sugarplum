import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
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
import { isGuest } from "../guest/session";
import { useTrackedOp } from "../progress/useTrackedOp";

export default function LibraryPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [draftJobs, setDraftJobs] = useState<JobListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const guest = isGuest();
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
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 5 } }}>
      {!ready ? (
        <Typography color="text.secondary">Loading library…</Typography>
      ) : (
        <Stack spacing={3}>
          <Box>
            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              sx={{ color: "text.primary", fontWeight: 600 }}
            >
              Library
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create decks, paste notes, or upload PDF, PPTX, or image
              materials.
            </Typography>
          </Box>

          {error ? <Alert severity="error">{error}</Alert> : null}

          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              bgcolor: "background.paper",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="subtitle1"
              component="h2"
              sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
            >
              Your decks
            </Typography>
            {decks.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No decks yet. Create one below.
              </Typography>
            ) : (
              <Stack
                component="ul"
                spacing={0}
                divider={<Divider flexItem />}
                sx={{ m: 0, p: 0, listStyle: "none" }}
              >
                {decks.map((d) => (
                  <Typography
                    component="li"
                    key={d.id}
                    variant="body2"
                    sx={{ py: 1 }}
                  >
                    {d.title}
                  </Typography>
                ))}
              </Stack>
            )}
          </Paper>

          {draftJobs.length > 0 ? (
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                bgcolor: "background.paper",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="subtitle1"
                component="h2"
                sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
              >
                Draft reviews
              </Typography>
              <Stack
                component="ul"
                spacing={0}
                divider={<Divider flexItem />}
                sx={{ m: 0, p: 0, listStyle: "none" }}
              >
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
                    <Typography
                      component="li"
                      key={job.id}
                      variant="body2"
                      sx={{ py: 1 }}
                    >
                      <Link
                        href={`/jobs/${encodeURIComponent(job.id)}/drafts`}
                        underline="hover"
                        color="primary"
                      >
                        {label}
                      </Link>
                      {suffix}
                    </Typography>
                  );
                })}
              </Stack>
            </Paper>
          ) : null}

          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              bgcolor: "background.paper",
              borderColor: "divider",
            }}
          >
            <CreateMaterialStepper
              decks={decks}
              setDecks={setDecks}
              activeStep={activeStep}
              setActiveStep={setActiveStep}
              localOnly={guest}
              onChanged={async () => {
                await syncStepperFromJourney();
                await refreshDraftJobs();
              }}
            />
          </Paper>

          <Typography variant="body2">
            <Link href="/today" underline="hover" color="primary">
              Back home
            </Link>
          </Typography>
        </Stack>
      )}
    </Container>
  );
}
