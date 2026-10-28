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
import CardFace, { type OcclusionStudyFace } from "../components/CardFace";
import GradeButtons from "../components/GradeButtons";
import McqFace from "../components/McqFace";
import {
  ApiError,
  listDecks,
  listDueCards,
  listSubjects,
  me,
  reviewCard,
  type CardDraftView,
  type OcclusionFrontView,
  type StudyRating,
} from "../api/client";
import { isGuest } from "../guest/session";
import { navigate } from "../nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";
import { resolveCardGesture } from "../study/cardGestures";
import {
  dueScopeFromSearch,
  filterDueExcludingPending,
  loadDueCache,
  pruneDueCacheCard,
  saveDueCache,
  type DueScopeOpts,
} from "../study/dueCache";
import { enqueuePendingGrade, pendingCardIdSet } from "../study/pendingGrades";
import {
  occlusionRevealAnswer,
  pickOcclusionRegion,
} from "../study/pickOcclusionRegion";
import {
  cardIdFromSearch,
  prioritizeDueCard,
} from "../study/prioritizeDueCard";
import { isNetworkGradeError } from "../study/runPendingFlush";
import { usePendingGradeSync } from "../study/usePendingGradeSync";
import { useStudyZenMode } from "../study/useStudyZenMode";
import { warmDueMedia } from "../study/warmDueMedia";

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
  if (type === "mcq") return "Multiple choice";
  if (type === "image_label") return "Image label";
  if (type === "diagram") return "Diagram";
  if (type === "occlusion") return "Occlusion";
  return "Q&A";
}

function isMcqCard(card: CardDraftView | null): boolean {
  return card?.type === "mcq";
}

function isOcclusionFront(
  front: CardDraftView["front"],
): front is OcclusionFrontView {
  return typeof front === "object" && front !== null && "regions" in front;
}

function studyFrontText(card: CardDraftView): string {
  if (isOcclusionFront(card.front)) {
    return card.front.prompt?.trim() || "Identify the hidden region";
  }
  return typeof card.front === "string" ? card.front : "";
}

function fallbackBackText(card: CardDraftView): string {
  const { back } = card;
  if (typeof back === "object" && back !== null && "answer" in back) {
    return back.answer;
  }
  return typeof back === "string" ? back : "";
}

type OcclusionStudyParts = {
  face: OcclusionStudyFace | undefined;
  answer: string;
};

/**
 * One hide_one pick drives both the mask and the reveal answer (region label,
 * else back.answer).
 */
function occlusionStudyParts(card: CardDraftView): OcclusionStudyParts {
  const fallback = fallbackBackText(card);
  if (card.type !== "occlusion" || !isOcclusionFront(card.front)) {
    return { face: undefined, answer: fallback };
  }
  const region = pickOcclusionRegion(card.id, card.front.regions);
  if (!region) {
    return { face: undefined, answer: fallback };
  }
  return {
    face: {
      imageKey: card.front.image_key,
      mask: { x: region.x, y: region.y, w: region.w, h: region.h },
    },
    answer: occlusionRevealAnswer(region, fallback),
  };
}

/** Study session: reveal answer, grade with FSRS (keys 1-4). Code-led MUI. */
export default function StudyPage() {
  const [queue, setQueue] = useState<CardDraftView[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [deepLinkMiss, setDeepLinkMiss] = useState(false);
  const [scopeOpts] = useState<DueScopeOpts | undefined>(() =>
    dueScopeFromSearch(window.location.search),
  );
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
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

  const applyDueQueue = useCallback(
    (cards: CardDraftView[], wanted: string | null) => {
      const { queue: next, found } = prioritizeDueCard(cards, wanted);
      setQueue(next);
      // Only when there are other due cards to study (avoids contradicting empty session).
      setDeepLinkMiss(Boolean(wanted) && !found && next.length > 0);
      setRevealed(false);
    },
    [],
  );

  const load = useCallback(
    async (uid: string) => {
      const wanted = cardIdFromSearch(window.location.search);
      try {
        const due = await listDueCards(scopeOpts);
        saveDueCache(uid, due, scopeOpts);
        warmDueMedia(due);
        applyDueQueue(due, wanted);
        setOfflineCopy(false);
      } catch (err) {
        const cached = loadDueCache(uid, scopeOpts);
        if (cached && cached.cards.length > 0) {
          const filtered = filterDueExcludingPending(
            cached.cards,
            pendingCardIdSet(uid),
          );
          if (filtered.length === 0) throw err;
          applyDueQueue(filtered, wanted);
          setOfflineCopy(true);
          return;
        }
        throw err;
      }
    },
    [applyDueQueue, scopeOpts],
  );

  const {
    userId,
    setUserId,
    pendingCount,
    syncSummary,
    setSyncSummary,
    refreshPendingCount,
    flushOnMount,
  } = usePendingGradeSync({
    // Flush refreshes global due; reload with page scope so queues do not bleed.
    onDueRefreshed: () => {
      if (userId) void load(userId);
    },
    onDueRefreshFailed: (uid) => load(uid),
  });

  useEffect(() => {
    let cancelled = false;
    if (!scopeOpts) {
      setScopeLabel(null);
      return;
    }
    (async () => {
      try {
        if (scopeOpts.deckId) {
          const decks = await listDecks();
          if (cancelled) return;
          const deck = decks.find((d) => d.id === scopeOpts.deckId);
          setScopeLabel(deck?.title ?? "This deck");
          return;
        }
        if (scopeOpts.subjectId) {
          const subjects = await listSubjects();
          if (cancelled) return;
          const subject = subjects.find((s) => s.id === scopeOpts.subjectId);
          setScopeLabel(subject?.title ?? "This subject");
        }
      } catch {
        if (!cancelled) {
          setScopeLabel(scopeOpts.deckId ? "This deck" : "This subject");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeOpts]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await me();
        if (cancelled) return;
        setUserId(user.id);
        refreshPendingCount(user.id);
        await flushOnMount(user.id);
        if (cancelled) return;
        await load(user.id);
        if (!cancelled) {
          refreshPendingCount(user.id);
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
  }, [endLoad, flushOnMount, load, refreshPendingCount, setUserId]);

  const current = queue[0] ?? null;
  const mcqMode = isMcqCard(current);
  const occlusionParts = current
    ? occlusionStudyParts(current)
    : { face: undefined, answer: "" };

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

  const advanceAfterGrade = useCallback((fromMcq: boolean) => {
    if (!fromMcq) {
      focusShowAnswerAfterGradeRef.current = true;
    }
    setQueue((prev) => prev.slice(1));
    setRevealed(false);
  }, []);

  const onGrade = useCallback(
    async (rating: StudyRating, fromMcq = false): Promise<boolean> => {
      if (!current || busyRef.current) return false;
      if (!fromMcq && !revealed) return false;
      busyRef.current = true;
      setError(null);
      begin();

      const queueOffline = (uid: string) => {
        if (!enqueuePendingGrade(uid, current.id, rating)) {
          setError("Could not save grade offline (storage full).");
          end(false);
          return false;
        }
        pruneDueCacheCard(uid, current.id, scopeOpts);
        refreshPendingCount(uid);
        advanceAfterGrade(fromMcq);
        end();
        return true;
      };

      if (!isGuest() && offlineCopy && userId) {
        return queueOffline(userId);
      }

      try {
        await reviewCard(current.id, rating);
        advanceAfterGrade(fromMcq);
        end();
        return true;
      } catch (err) {
        if (!isGuest() && userId && isNetworkGradeError(err)) {
          return queueOffline(userId);
        }
        setError(
          err instanceof ApiError ? err.message : "Could not save grade",
        );
        end(false);
        return false;
      }
    },
    [
      advanceAfterGrade,
      begin,
      current,
      end,
      offlineCopy,
      refreshPendingCount,
      revealed,
      scopeOpts,
      userId,
    ],
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
      if (isMcqCard(current) || !revealed || busyRef.current || !current)
        return;
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
    if (
      !start ||
      start.id !== e.pointerId ||
      busyRef.current ||
      !current ||
      isMcqCard(current)
    )
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
                  {mcqMode
                    ? "Tap the best answer. Wrong counts as Again; right as Good."
                    : "Reveal the answer, then grade. Keys 1-4 on desktop."}
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
              {scopeLabel ? (
                <Chip
                  size="small"
                  label={
                    scopeOpts?.deckId
                      ? `Deck: ${scopeLabel}`
                      : `Subject: ${scopeLabel}`
                  }
                  variant="outlined"
                />
              ) : null}
            </Stack>
          ) : null}

          {error ? <Alert severity="error">{error}</Alert> : null}
          {syncSummary ? (
            <Alert severity="info" onClose={() => setSyncSummary(null)}>
              {syncSummary}
            </Alert>
          ) : null}
          {offlineCopy ? (
            <Alert severity="warning">
              Showing an offline copy of due cards.
              {pendingCount > 0
                ? ` ${pendingCount} ${pendingCount === 1 ? "grade" : "grades"} waiting to sync.`
                : ""}
            </Alert>
          ) : pendingCount > 0 ? (
            <Alert severity="info">
              {pendingCount} {pendingCount === 1 ? "grade" : "grades"} waiting
              to sync.
            </Alert>
          ) : null}
          {deepLinkMiss ? (
            <Alert severity="info" onClose={() => setDeepLinkMiss(false)}>
              Card not in due queue. Studying your due cards instead.
            </Alert>
          ) : null}
          {fullscreenUnavailable ? (
            <Alert severity="info" onClose={clearFullscreenUnavailable}>
              Fullscreen unavailable
            </Alert>
          ) : null}

          {!current ? (
            scopeOpts ? (
              <Alert severity="info">
                No cards due in this{" "}
                {scopeOpts.deckId ? "deck" : "subject"}
                {scopeLabel ? ` (${scopeLabel})` : ""}.{" "}
                <Link
                  href={
                    scopeOpts.deckId
                      ? `/library/decks/${encodeURIComponent(scopeOpts.deckId)}`
                      : `/library/subjects/${encodeURIComponent(scopeOpts.subjectId!)}`
                  }
                  underline="hover"
                  onClick={(ev) => {
                    ev.preventDefault();
                    navigate(
                      scopeOpts.deckId
                        ? `/library/decks/${encodeURIComponent(scopeOpts.deckId)}`
                        : `/library/subjects/${encodeURIComponent(scopeOpts.subjectId!)}`,
                    );
                  }}
                >
                  Back to {scopeOpts.deckId ? "deck" : "subject"}
                </Link>
              </Alert>
            ) : (
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
            )
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
                {mcqMode ? (
                  <McqFace
                    cardId={current.id}
                    front={studyFrontText(current)}
                    back={occlusionParts.answer}
                    options={current.options}
                    disabled={busy}
                    onGrade={(rating) => onGrade(rating, true)}
                  />
                ) : (
                  <CardFace
                    front={studyFrontText(current)}
                    back={occlusionParts.answer}
                    type={current.type}
                    mediaR2Keys={current.media_r2_keys}
                    occlusion={occlusionParts.face}
                    revealed={revealed}
                    onReveal={reveal}
                    onFlipBack={flipBack}
                    disabled={busy}
                    answerFocusRef={answerFocusRef}
                    showAnswerRef={showAnswerRef}
                  />
                )}
              </Box>

              {mcqMode ? (
                <Box sx={{ minHeight: 72 }} aria-hidden />
              ) : revealed ? (
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
