import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import TodayIcon from "@mui/icons-material/Today";
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
import { useTrackedOp } from "../progress/useTrackedOp";
import { resolveCardGesture } from "../study/cardGestures";
import { loadDueCache, saveDueCache } from "../study/dueCache";
import { useStudyChrome } from "../study/StudyChromeContext";
import { loadZenPreference, saveZenPreference } from "../study/zenPreference";

/** True when the event target sits in a CardFace content box that overflows. */
function isInsideScrollableCardFace(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const face = target.closest("[data-card-face-content]");
  if (!(face instanceof HTMLElement)) return false;
  return face.scrollHeight > face.clientHeight;
}

function requestStudyFullscreen(): Promise<void> {
  return document.documentElement.requestFullscreen?.() ?? Promise.resolve();
}

function exitStudyFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen?.();
  }
}

/** Study session: reveal answer, grade with FSRS (keys 1-4). Code-led MUI. */
export default function StudyPage() {
  const [queue, setQueue] = useState<CardDraftView[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [zen, setZen] = useState(() => loadZenPreference());
  const [needsFullscreenPrompt, setNeedsFullscreenPrompt] = useState(
    () => loadZenPreference(),
  );
  const [fullscreenUnavailable, setFullscreenUnavailable] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const { setHideChrome } = useStudyChrome();
  const gradeGroupRef = useRef<HTMLDivElement | null>(null);
  const swipeHintUsedRef = useRef(false);
  const pointerRef = useRef<{
    id: number;
    x: number;
    y: number;
  } | null>(null);
  const zenRef = useRef(zen);
  zenRef.current = zen;
  const { end: endLoad } = useTrackedOp("Loading study…", {
    trackOnMount: true,
  });
  const { busy, begin, end } = useTrackedOp("Saving grade…");
  const busyRef = useRef(busy);
  busyRef.current = busy;

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
    setHideChrome(loadZenPreference());
    return () => {
      setHideChrome(false);
      exitStudyFullscreen();
    };
  }, [setHideChrome]);

  useEffect(() => {
    function onFullscreenChange() {
      if (document.fullscreenElement) return;
      if (!zenRef.current) return;
      zenRef.current = false;
      setZen(false);
      setHideChrome(false);
      saveZenPreference(false);
      setNeedsFullscreenPrompt(false);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [setHideChrome]);

  const enterZen = useCallback(async () => {
    saveZenPreference(true);
    setZen(true);
    zenRef.current = true;
    setHideChrome(true);
    setNeedsFullscreenPrompt(false);
    try {
      await requestStudyFullscreen();
    } catch {
      setFullscreenUnavailable(true);
    }
  }, [setHideChrome]);

  const exitZen = useCallback(() => {
    saveZenPreference(false);
    setZen(false);
    zenRef.current = false;
    setHideChrome(false);
    setNeedsFullscreenPrompt(false);
    exitStudyFullscreen();
  }, [setHideChrome]);

  const toggleZen = useCallback(() => {
    if (zen) {
      exitZen();
      return;
    }
    void enterZen();
  }, [enterZen, exitZen, zen]);

  const ensureFullscreenIfNeeded = useCallback(() => {
    if (!needsFullscreenPrompt || !zen || document.fullscreenElement) return;
    setNeedsFullscreenPrompt(false);
    void requestStudyFullscreen().catch(() => {
      setFullscreenUnavailable(true);
    });
  }, [needsFullscreenPrompt, zen]);

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

  const reveal = useCallback(() => {
    setRevealed(true);
    if (!swipeHintUsedRef.current) {
      swipeHintUsedRef.current = true;
      setShowSwipeHint(true);
    } else {
      setShowSwipeHint(false);
    }
  }, []);

  useEffect(() => {
    if (!revealed) return;
    gradeGroupRef.current?.focus();
  }, [revealed, current?.id]);

  const onGrade = useCallback(
    async (rating: StudyRating) => {
      if (!current || busyRef.current || !revealed) return;
      busyRef.current = true;
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
    [begin, current, end, revealed],
  );

  useEffect(() => {
    if (!ready) return;

    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "Escape") {
        // Browser owns Esc while in FS; fullscreenchange exits zen.
        if (!zenRef.current || document.fullscreenElement) return;
        e.preventDefault();
        exitZen();
        return;
      }
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        toggleZen();
        return;
      }
      if (!revealed || busyRef.current || !current) return;
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
  }, [current, exitZen, onGrade, ready, revealed, toggleZen]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    ensureFullscreenIfNeeded();
    pointerRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start || start.id !== e.pointerId || busyRef.current || !current)
      return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (
      Math.abs(dy) >= Math.abs(dx) &&
      isInsideScrollableCardFace(e.target)
    ) {
      return;
    }
    const result = resolveCardGesture({ revealed, dx, dy });
    if (result.type === "reveal") {
      reveal();
      return;
    }
    if (result.type === "grade") {
      void onGrade(result.rating);
    }
  };

  const onPointerCancel = () => {
    pointerRef.current = null;
  };

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
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          spacing={1}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" component="h1" color="primary" gutterBottom>
              Study
            </Typography>
            {!zen ? (
              <Typography variant="body2" color="text.secondary">
                Reveal the answer, then grade. Keys 1-4 on desktop.
              </Typography>
            ) : null}
          </Box>
          <IconButton
            aria-label={zen ? "Exit zen mode" : "Enter zen mode"}
            aria-pressed={zen}
            onClick={toggleZen}
            color="primary"
          >
            {zen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </IconButton>
        </Stack>

        {!zen ? (
          <Stack direction="row" spacing={2} alignItems="center">
            <Link href="/today" underline="hover">
              Today
            </Link>
            <Link href="/library" underline="hover">
              Library
            </Link>
          </Stack>
        ) : null}

        {error ? <Alert severity="error">{error}</Alert> : null}
        {offlineCopy ? (
          <Alert severity="warning">
            Showing an offline copy of due cards. Grading still needs a network
            connection.
          </Alert>
        ) : null}
        {fullscreenUnavailable ? (
          <Alert severity="info" onClose={() => setFullscreenUnavailable(false)}>
            Fullscreen unavailable
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
              {!zen ? (
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
              ) : null}
            </Stack>

            <Box
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              sx={{ touchAction: "manipulation" }}
            >
              <CardFace
                front={String(current.front)}
                back={String(current.back)}
                mediaR2Keys={current.media_r2_keys}
                revealed={revealed}
                onReveal={reveal}
                disabled={busy}
              />
            </Box>

            {revealed ? (
              <Box ref={gradeGroupRef} tabIndex={-1} sx={{ outline: "none" }}>
                <GradeButtons
                  disabled={busy}
                  onGrade={onGrade}
                  showSwipeHint={showSwipeHint}
                />
              </Box>
            ) : null}
          </>
        )}
      </Stack>
    </Container>
  );
}
