import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ApiError, listDueCards, me } from "../api/client";
import { useTrackedBusy } from "../progress/useTrackedBusy";
import { loadDueCache, saveDueCache } from "../study/dueCache";

/** Home: due count and start a study session. Code-led MUI; no Impeccable comps. */
export default function TodayPage() {
  const [dueCount, setDueCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [ready, setReady] = useState(false);
  const { end: endLoad } = useTrackedBusy("Loading today…", {
    trackOnMount: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        try {
          const due = await listDueCards();
          if (cancelled) return;
          saveDueCache(due);
          setDueCount(due.length);
          setOfflineCopy(false);
        } catch (err) {
          if (cancelled) return;
          const cached = loadDueCache();
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
          <Button
            variant="contained"
            href="/study"
            disabled={dueCount === 0}
          >
            Start study
          </Button>
          <Button variant="outlined" href="/library">
            Library
          </Button>
          <Button variant="outlined" href="/settings">
            Settings
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          <Link href="/login" underline="hover">
            Sign in
          </Link>
          {" · "}
          <Link href="/register" underline="hover">
            Register
          </Link>
        </Typography>
      </Stack>
    </Container>
  );
}
