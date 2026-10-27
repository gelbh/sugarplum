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
import { useStudyZenMode } from "../study/useStudyZenMode";

type PointerStart = {
  id: number;
  x: number;
  y: number;
  scrollEl: HTMLElement | null;
  scrollTop: number;
};

function scrollableCardFace(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const face = target.closest("[data-card-face-content]");
  if (!(face instanceof HTMLElement)) return null;
  if (face.scrollHeight <= face.clientHeight) return null;
  return face;
}

function typeLabel(type: CardDraftView["type"]): string {
  if (type === "cloze") return "Cloze";
  if (type === "image_label") return "Image label";
  if (type === "diagram") return "Diagram";
  return "Q&A";
}

/** Study session: reveal answer, grade with FSRS (keys 1-4). Code-led MUI. */
export default function StudyPage() {
  const [queue, setQueue] = useState<CardDraftView[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const {
    zen,
    fullscreenUnavailable,
    clearFullscreenUnavailable,
    toggleZen,
    exitZen,
    ensureFullscreenIfNeeded,
    isZen,
  } = useStudyZenMode();

  const answerFocusRef = useRef<HTMLElement | null>(null);
  const showAnswerRef = useRef<HTMLButtonElement | null>(null);
  const swipeHintUsedRef = useRef(false);
  const focusShowAnswerAfterGradeRef = useRef(false);
  const pointerRef = useRef<PointerStart | null>(null);
  const busyRef = useRef(false);

  const { end: endLoad } = useTrackedOp("Loading study…", {
    trackOnMount: true,
  });
  const { busy, begin, end } = useTrackedOp("Saving grade…");

  useEffect(() => {
    if (!busy) busyRef.current = false;
  }, [busy]);

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

  const reveal = useCallback(() => {
    setRevealed(true);
    if (!swipeHintUsedRef.current) {
      swipeHintUsedRef.current = true;
      setShowSwipeHint(true);
    } else {
      setShowSwipeHint(false);
    }
  }, []);

  const flipBack = useCallback(() => {
    setRevealed(false);
    setShowSwipeHint(false);
    focusShowAnswerAfterGradeRef.current = true;
  }, []);

  useEffect(() => {
    if (!revealed) return;
    answerFocusRef.current?.focus();
  }, [revealed, current?.id]);

  useEffect(() => {
    if (revealed || !current || !focusShowAnswerAfterGradeRef.current) return;
    focusShowAnswerAfterGradeRef.current = false;
    showAnswerRef.current?.focus();
  }, [revealed, current?.id]);

  const onGrade = useCallback(
    async (rating: StudyRating) => {
      if (!current || busyRef.current || !revealed) return;
      busyRef.current = true;
      setError(null);
      begin();
      try {
        await reviewCard(current.id, rating);
        focusShowAnswerAfterGradeRef.current = true;
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
        if (!isZen() || document.fullscreenElement) return;
        e.preventDefault();
        exitZen();
        return;
      }
      if (e.key === "z" || e.key === "Z") {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
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
  }, [current, exitZen, isZen, onGrade, ready, revealed, toggleZen]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    ensureFullscreenIfNeeded();
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    const scrollEl = scrollableCardFace(e.target);
    pointerRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      scrollEl,
      scrollTop: scrollEl?.scrollTop ?? 0,
    };
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
      start.scrollEl &&
      start.scrollEl.scrollTop !== start.scrollTop
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
    <Box
      className={zen ? "sp-stage" : undefined}
      sx={{
        minHeight: zen ? "100vh" : undefined,
        ...(zen
          ? {
              color: "var(--sp-ivory)",
              "& .MuiIconButton-root": { color: "var(--sp-ivory)" },
            }
          : {}),
      }}
    >
      <Container
        maxWidth="sm"
        sx={{
          py: zen ? { xs: 2, sm: 3 } : 4,
          minHeight: zen ? "100vh" : undefined,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <Stack
          spacing={zen ? 1.5 : 2}
          sx={{ flex: 1, minHeight: zen ? "100%" : undefined }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
            spacing={1}
            sx={{ position: "relative" }}
          >
            {zen ? (
              <Typography
                variant="h6"
                component="p"
                sx={{
                  width: "100%",
                  textAlign: "center",
                  fontWeight: 400,
                  letterSpacing: "0.02em",
                  color: "var(--sp-ivory)",
                  opacity: 0.92,
                  pr: 5,
                  pl: 5,
                }}
              >
                Sugarplum
              </Typography>
            ) : (
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="h4"
                  component="h1"
                  color="primary"
                  gutterBottom
                >
                  Study
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Reveal the answer, then grade. Keys 1-4 on desktop.
                </Typography>
              </Box>
            )}
            <IconButton
              aria-label={zen ? "Exit zen mode" : "Enter zen mode"}
              aria-pressed={zen}
              onClick={toggleZen}
              color="primary"
              sx={zen ? { position: "absolute", right: 0, top: -4 } : undefined}
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
              Showing an offline copy of due cards. Grading still needs a
              network connection.
            </Alert>
          ) : null}
          {fullscreenUnavailable ? (
            <Alert severity="info" onClose={clearFullscreenUnavailable}>
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
                sx={{ opacity: zen ? 0.7 : 1 }}
              >
                <Typography
                  variant="caption"
                  color={zen ? undefined : "text.secondary"}
                  sx={{
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    ...(zen ? { color: "var(--sp-ivory)" } : {}),
                  }}
                >
                  {queue.length} remaining
                </Typography>
                {!zen ? (
                  <Chip
                    size="small"
                    label={typeLabel(current.type)}
                    variant="outlined"
                    sx={{
                      height: 24,
                      fontWeight: 400,
                      letterSpacing: "0.04em",
                      borderColor: "divider",
                      color: "text.secondary",
                      bgcolor: "transparent",
                      "& .MuiChip-label": { px: 1 },
                    }}
                  />
                ) : null}
              </Stack>

              <Box
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                sx={{
                  touchAction: "manipulation",
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  py: zen ? 2 : 1,
                  minHeight: 0,
                }}
              >
                <CardFace
                  front={String(current.front)}
                  back={String(current.back)}
                  type={current.type}
                  mediaR2Keys={current.media_r2_keys}
                  revealed={revealed}
                  onReveal={reveal}
                  onFlipBack={flipBack}
                  disabled={busy}
                  answerFocusRef={answerFocusRef}
                  showAnswerRef={showAnswerRef}
                />
              </Box>

              {revealed ? (
                <Box sx={{ pb: zen ? 1 : 0, mt: "auto" }}>
                  <GradeButtons
                    disabled={busy}
                    onGrade={onGrade}
                    showSwipeHint={showSwipeHint}
                  />
                </Box>
              ) : (
                <Box sx={{ minHeight: 72 }} aria-hidden />
              )}
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
