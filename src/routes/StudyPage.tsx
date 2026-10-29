import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import TodayIcon from "@mui/icons-material/Today";
import CardFace, { type OcclusionStudyFace } from "../components/CardFace";
import GradeButtons from "../components/GradeButtons";
import McqFace from "../components/McqFace";
import {
  ApiError,
  listDecks,
  commitStudyPacing,
  listDueCards,
  listSubjects,
  me,
  reviewCard,
  type CardDraftView,
  type OcclusionFrontView,
  type StudyQueueMeta,
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
import { bumpIntroBonus, getIntroBonus } from "../study/introBonus";
import { clientLocalDay } from "../study/localDay";
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
  /** True once this mount showed at least one due card (scoped session-complete). */
  const [hadCards, setHadCards] = useState(false);
  const [queueMeta, setQueueMeta] = useState<StudyQueueMeta | null>(null);
  const introBonusRef = useRef<number | undefined>(undefined);
  if (introBonusRef.current === undefined) {
    introBonusRef.current = getIntroBonus();
  }
  const { zen, toggleZen, exitZen, ensureFullscreenIfNeeded } =
    useStudyZenMode();

  const leaveStudy = useCallback(() => {
    exitZen();
    navigate("/today");
  }, [exitZen]);

  const answerFocusRef = useRef<HTMLElement | null>(null);
  const showAnswerRef = useRef<HTMLButtonElement | null>(null);
  const swipeHintUsedRef = useRef(false);
  const focusShowAnswerAfterGradeRef = useRef(false);
  const pointerRef = useRef<PointerStart | null>(null);
  const busyRef = useRef(false);
  /** Suppress leave-on-Esc for one tick after FS exits (UA may clear FS before keydown). */
  const ignoreEscLeaveUntilRef = useRef(0);

  const { end: endLoad } = useTrackedOp("Loading study…", {
    trackOnMount: true,
  });
  const { busy, begin, end } = useTrackedOp("Saving grade…");
  const {
    busy: studyMoreBusy,
    begin: beginStudyMore,
    end: endStudyMore,
  } = useTrackedOp("Loading more…");

  useEffect(() => {
    if (!busy) busyRef.current = false;
  }, [busy]);

  const applyDueQueue = useCallback(
    (cards: CardDraftView[], wanted: string | null) => {
      const { queue: next, found } = prioritizeDueCard(cards, wanted);
      setQueue(next);
      if (next.length > 0) setHadCards(true);
      // Only when there are other due cards to study (avoids contradicting empty session).
      setDeepLinkMiss(Boolean(wanted) && !found && next.length > 0);
      setRevealed(false);
    },
    [],
  );

  const load = useCallback(
    async (uid: string, bonusOverride?: number) => {
      const wanted = cardIdFromSearch(window.location.search);
      const bonus = bonusOverride ?? introBonusRef.current ?? 0;
      const dueOpts = {
        ...scopeOpts,
        localDay: clientLocalDay(),
        ...(bonus > 0 ? { introBonus: bonus } : {}),
      };
      try {
        const {
          cards: due,
          meta,
          pendingDeferrals,
        } = await listDueCards(dueOpts);
        if ((pendingDeferrals?.length ?? 0) > 0) {
          try {
            await commitStudyPacing(dueOpts);
          } catch {
            /* peek queue still usable; dues stay until next commit */
          }
        }
        saveDueCache(uid, due, scopeOpts);
        warmDueMedia(due);
        applyDueQueue(due, wanted);
        setQueueMeta(meta);
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
      if (!userId) return;
      void load(userId).catch((err) => {
        setError(
          err instanceof ApiError ? err.message : "Failed to refresh study",
        );
      });
    },
    onDueRefreshFailed: (uid) => load(uid),
  });

  const onStudyMore = useCallback(async () => {
    if (!userId || studyMoreBusy || offlineCopy) return;
    setError(null);
    beginStudyMore();
    try {
      const next = bumpIntroBonus();
      introBonusRef.current = next;
      await load(userId, next);
      endStudyMore();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load more cards",
      );
      endStudyMore(false);
    }
  }, [beginStudyMore, endStudyMore, load, offlineCopy, studyMoreBusy, userId]);

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
  const canStudyMore = !offlineCopy && (queueMeta?.heldIntroCount ?? 0) > 0;

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
        await reviewCard(current.id, rating, {
          localDay: clientLocalDay(),
        });
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
    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        ignoreEscLeaveUntilRef.current = performance.now() + 500;
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

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
        e.preventDefault();
        if (document.fullscreenElement) {
          ignoreEscLeaveUntilRef.current = performance.now() + 500;
          void document.exitFullscreen?.();
          return;
        }
        if (performance.now() < ignoreEscLeaveUntilRef.current) {
          return;
        }
        leaveStudy();
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
  }, [current, leaveStudy, onGrade, ready, revealed, toggleZen]);

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

  const stage = zen;

  return (
    <Box
      className={stage ? "sp-stage" : undefined}
      sx={{
        minHeight: stage ? "100vh" : undefined,
        ...(stage
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
          py: stage ? { xs: 2, sm: 3 } : 4,
          minHeight: stage ? "100vh" : undefined,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <Stack
          spacing={stage ? 1.5 : 2}
          sx={{ flex: 1, minHeight: stage ? "100%" : undefined }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            spacing={1}
            sx={{ position: "relative" }}
          >
            <IconButton
              aria-label="Leave study"
              onClick={leaveStudy}
              color="primary"
              size="small"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
            <Typography
              variant="h6"
              component="p"
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                textAlign: "center",
                fontWeight: 400,
                letterSpacing: "0.02em",
                color: stage ? "var(--sp-ivory)" : "text.primary",
                opacity: 0.92,
                pointerEvents: "none",
              }}
            >
              Sugarplum
            </Typography>
            <IconButton
              aria-label="Fullscreen"
              onClick={toggleZen}
              color="primary"
              size="small"
            >
              <FullscreenIcon fontSize="small" />
            </IconButton>
          </Stack>

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

          {!current ? (
            scopeOpts && !hadCards ? (
              <Stack spacing={1.5}>
                <Alert severity="info">
                  No cards due in this {scopeOpts.deckId ? "deck" : "subject"}
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
                {canStudyMore ? (
                  <Button
                    variant="outlined"
                    disabled={studyMoreBusy}
                    onClick={() => void onStudyMore()}
                  >
                    {studyMoreBusy ? "Loading…" : "Study more"}
                  </Button>
                ) : null}
              </Stack>
            ) : !hadCards && canStudyMore ? (
              <Stack spacing={1.5} alignItems="stretch">
                <Typography
                  variant="body1"
                  sx={{ textAlign: "center", opacity: stage ? 0.9 : 1 }}
                >
                  Nothing due yet. You can study held introductions early.
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  disabled={studyMoreBusy}
                  onClick={() => void onStudyMore()}
                >
                  {studyMoreBusy ? "Loading…" : "Study more"}
                </Button>
              </Stack>
            ) : !hadCards ? (
              <Stack spacing={1.5} alignItems="stretch">
                <Typography
                  variant="body1"
                  sx={{ textAlign: "center", opacity: stage ? 0.9 : 1 }}
                >
                  Nothing due yet. Add material to create your first cards.
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  href="/library"
                  onClick={(ev) => {
                    ev.preventDefault();
                    exitZen();
                    navigate("/library");
                  }}
                >
                  Open Library
                </Button>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                <Alert severity="success">
                  Session complete.{" "}
                  {scopeOpts ? (
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
                  ) : (
                    <Button
                      variant="contained"
                      href="/today"
                      startIcon={<TodayIcon fontSize="small" />}
                      size="small"
                      onClick={(ev) => {
                        ev.preventDefault();
                        leaveStudy();
                      }}
                    >
                      Today
                    </Button>
                  )}
                </Alert>
                {canStudyMore ? (
                  <Button
                    variant="contained"
                    color="primary"
                    disabled={studyMoreBusy}
                    onClick={() => void onStudyMore()}
                  >
                    {studyMoreBusy ? "Loading…" : "Study more"}
                  </Button>
                ) : null}
              </Stack>
            )
          ) : (
            <>
              <Typography
                variant="caption"
                sx={{
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  opacity: 0.7,
                  color: stage ? "var(--sp-ivory)" : "text.secondary",
                }}
              >
                {queue.length} remaining
              </Typography>

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
                  py: 2,
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
                <Box sx={{ pb: 1, mt: "auto" }}>
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
