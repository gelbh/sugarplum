import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ApiError, listDueCards, me, getJourney } from "../api/client";
import { deriveJourney } from "../journey/derive";
import type { JourneyView } from "../journey/types";
import JourneyRail from "../components/JourneyRail";
import JourneyNextButton from "../components/JourneyNextButton";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

/** Home: due count and start a study session. Code-led MUI; no Impeccable comps. */
export default function TodayPage() {
  const [dueCount, setDueCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<JourneyView | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        const due = await listDueCards();
        const journey = await getJourney();
        if (cancelled) return;
        setDueCount(due.length);
        setView(deriveJourney(journey));
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load due");
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography color="text.secondary">Loading today…</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Stack spacing={3}>
        {view ? <JourneyRail view={view} /> : null}
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

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          {dueCount > 0 ? (
            <Button variant="contained" href="/study" startIcon={<PlayArrowIcon />} disabled={dueCount === 0}>
              Start study
            </Button>
          ) : view ? (
            <Box sx={{ ml: "auto" }}>
              <JourneyNextButton view={view} />
            </Box>
          ) : (
            <Button variant="contained" href="/study" disabled>
              Start study
            </Button>
          )}
          <Button variant="outlined" href="/library">
            Library
          </Button>
          <Button variant="outlined" href="/settings">
            Settings
          </Button>
        </Stack>

        {/* sign in / register handled by AppShell; removed from Today page */}
      </Stack>
    </Container>
  );
}
