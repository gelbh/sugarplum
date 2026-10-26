import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CardFace from "../components/CardFace";
import GradeButtons from "../components/GradeButtons";
import {
  ApiError,
  listDueCards,
  me,
  reviewCard,
  type CardDraftView,
  type StudyRating,
} from "../api/client";
import { useTrackedBusy } from "../progress/useTrackedBusy";

/** Study session: reveal answer, grade with FSRS (keys 1-4). Code-led MUI. */
export default function StudyPage() {
  const [queue, setQueue] = useState<CardDraftView[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { end: endLoad } = useTrackedBusy("Loading study…", {
    trackOnMount: true,
  });
  const { busy, begin, end } = useTrackedBusy("Saving grade…");

  const load = useCallback(async () => {
    const due = await listDueCards();
    setQueue(due);
    setRevealed(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        await load();
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
        setError(err instanceof ApiError ? err.message : "Failed to load study");
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad, load]);

  const current = queue[0] ?? null;

  const onGrade = useCallback(
    async (rating: StudyRating) => {
      if (!current || busy || !revealed) return;
      setError(null);
      begin();
      try {
        await reviewCard(current.id, rating);
        setQueue((prev) => prev.slice(1));
        setRevealed(false);
        end();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not save grade");
        end(false);
      }
    },
    [begin, busy, current, end, revealed],
  );

  useEffect(() => {
    if (!revealed || busy || !current) return;

    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const map: Record<string, StudyRating> = {
        "1": 1,
        "2": 2,
        "3": 3,
        "4": 4,
      };
      const rating = map[e.key];
      if (!rating) return;
      e.preventDefault();
      void onGrade(rating);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, current, onGrade, revealed]);

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography color="text.secondary">Loading study…</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4" component="h1" color="primary" gutterBottom>
            Study
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Reveal the answer, then grade. Keys 1-4 on desktop.
          </Typography>
        </Box>

        <Stack direction="row" spacing={2} alignItems="center">
          <Link href="/" underline="hover">
            Today
          </Link>
          <Link href="/library" underline="hover">
            Library
          </Link>
        </Stack>

        {error ? <Alert severity="error">{error}</Alert> : null}

        {!current ? (
          <Alert severity="success">
            Session complete.{" "}
            <Link href="/" underline="hover">
              Back to today
            </Link>
          </Alert>
        ) : (
          <>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography variant="subtitle1">
                {queue.length} remaining
              </Typography>
              <Chip
                size="small"
                label={current.type === "cloze" ? "Cloze" : "Q&A"}
                color="secondary"
                variant="outlined"
              />
            </Stack>

            <CardFace
              front={String(current.front)}
              back={String(current.back)}
              revealed={revealed}
              onReveal={() => setRevealed(true)}
              disabled={busy}
            />

            {revealed ? (
              <GradeButtons disabled={busy} onGrade={onGrade} />
            ) : null}
          </>
        )}
      </Stack>
    </Container>
  );
}
