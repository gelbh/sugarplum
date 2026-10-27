import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ApiError, listDueCards, me, getJourney } from "../api/client";
import { deriveJourney } from "../journey/derive";
import type { JourneyView } from "../journey/types";
import JourneyNextButton from "../components/JourneyNextButton";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useTrackedOp } from "../progress/useTrackedOp";
import { loadDueCache, saveDueCache } from "../study/dueCache";

/** Home: due count and start a study session. Code-led MUI; no Impeccable comps. */
export default function TodayPage() {
  const [dueCount, setDueCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<JourneyView | null>(null);
  const { end: endLoad } = useTrackedOp("Loading today…", {
    trackOnMount: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await me();
        try {
          const due = await listDueCards();
          if (cancelled) return;
          saveDueCache(user.id, due);
          setDueCount(due.length);
          setOfflineCopy(false);
        } catch (err) {
          if (cancelled) return;
          const cached = loadDueCache(user.id);
          if (cached) {
            setDueCount(cached.cards.length);
            setOfflineCopy(true);
          } else {
            throw err;
          }
        }
        if (!cancelled) {
          setReady(true);
          endLoad();
        }
        try {
          const journey = await getJourney();
          if (!cancelled) setView(deriveJourney(journey));
        } catch {
          if (!cancelled) setView(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load due");
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad]);

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography color="text.secondary">Loading today…</Typography>
      </Container>
    );
  }

  // Today is due/study, not setup. Offer a single Next CTA when idle; no stage rail.
  const showJourneyNext =
    view != null && dueCount === 0 && view.next.href !== "/today";

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Stack spacing={3}>
        <Typography variant="h3" component="h1" color="primary">
          Today
        </Typography>

        <Typography variant="body1" color="text.secondary">
          {dueCount === 0
            ? "Nothing due right now."
            : dueCount === 1
              ? "1 card is due."
              : `${dueCount} cards are due.`}
        </Typography>

        {error ? <Alert severity="error">{error}</Alert> : null}
        {offlineCopy ? (
          <Alert severity="warning">
            Showing an offline copy of your due count.
          </Alert>
        ) : null}

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          {dueCount > 0 ? (
            <Button
              variant="contained"
              href="/study"
              startIcon={<PlayArrowIcon />}
            >
              Start study
            </Button>
          ) : null}
          {showJourneyNext ? (
            <JourneyNextButton
              view={view}
              onAction={(action) => {
                if (
                  action === "create_deck" ||
                  action === "add_material" ||
                  action === "add_more"
                ) {
                  window.location.assign("/library");
                }
              }}
            />
          ) : null}
          <Button variant="outlined" href="/library">
            Library
          </Button>
          <Button variant="outlined" href="/settings">
            Settings
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
