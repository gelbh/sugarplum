import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CardFace from "../components/CardFace";
import GradeButtons from "../components/GradeButtons";
import TodayIcon from "@mui/icons-material/Today";
import {
  ApiError,
  listDueCards,
  me,
  reviewCard,
  type CardDraftView,
  type StudyRating,
} from "../api/client";
import { useTrackedOp } from "../progress/useTrackedOp";
import { loadDueCache, saveDueCache } from "../study/dueCache";

/** Study session: reveal answer, grade with FSRS (keys 1-4). Code-led MUI. */
export default function StudyPage() {
  const [queue, setQueue] = useState<CardDraftView[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const { end: endLoad } = useTrackedOp("Loading study…", {
    trackOnMount: true,
  });
  const { busy, begin, end } = useTrackedOp("Saving grade…");

  const load = useCallback(async (userId: string) => {
    try {
      const due = await listDueCards();
      saveDueCache(userId, due);
      setQueue(due);
      setOfflineCopy(false);
      setRevealed(false);
    } catch (err) {
      const cached = loadDueCache(userId);
      if (cached && cached.cards.length > 0) {
        setQueue(cached.cards);
        setOfflineCopy(true);
        setRevealed(false);
        return;
      }
      throw err;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await me();
        await load(user.id);
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
        setError(
          err instanceof ApiError ? err.message : "Failed to load study",
        );
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
        setError(
          err instanceof ApiError ? err.message : "Could not save grade",
        );
        end(false);
      }
    },
    [begin, busy, current, end, revealed],
  );

  useEffect(() => {
    if (!revealed || busy || !current) return;

    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
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
          <Link href="/today" underline="hover">
            Today
          </Link>
          <Link href="/library" underline="hover">
            Library
          </Link>
        </Stack>

        {error ? <Alert severity="error">{error}</Alert> : null}
        {offlineCopy ? (
          <Alert severity="warning">
            Showing an offline copy of due cards. Grading still needs a network
            connection.
          </Alert>
        ) : null}

        {!current ? (
          <Alert severity="success">
            Session complete.{" "}
            <Button
              variant="contained"
              href="/today"
              startIcon={<TodayIcon fontSize="small" />}
              size="small"
            >
              Today
            </Button>
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

            <CardFace
              front={String(current.front)}
              back={String(current.back)}
              mediaR2Keys={current.media_r2_keys}
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
