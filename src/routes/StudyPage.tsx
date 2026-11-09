import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import { useUnlockToasts } from "../achievements/UnlockToastProvider";
import {
  rememberIncomingUnlocks,
  rememberUnlocks,
} from "../achievements/rememberUnlocks";
import type { UnlockView } from "../achievements/wire";
import CardFace, { type OcclusionStudyFace } from "../components/CardFace";
import GradeButtons from "../components/GradeButtons";
import {
  ApiError,
  commitStudyPacing,
  listDecks,
  listDueCards,
  listSubjects,
  me,
  reviewCard,
  type CardDraftView,
  type StudyQueueMeta,
  type StudyRating,
} from "../api/client";
import { isGuest } from "../guest/session";
import { navigate } from "../nav/navigate";
import { useTrackedOp } from "../progress/useTrackedOp";
import { backAnswer, isOcclusionFront } from "../lib/draftCardModel";
import { resolveCardGesture } from "../study/cardGestures";
import { studyQueueProgress } from "../study/studyQueueProgress";
import {
  faceScrollsFor,
  plainShortcutKey,
  resolveStudyKey,
} from "../study/studyKeys";
import { useStudyNotesOverlay } from "../study/useStudyNotesOverlay";
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
import SessionComplete from "../study/SessionComplete";
import { StudyCardActions } from "../study/StudyCardActions";
import {
  earliestPendingDueAt,
  isShortTermFollowUp,
  mergeDueLearning,
  nextLearningWakeAt,
  upsertPendingLearning,
  type PendingLearning,
} from "../study/learningRequeue";
import {
  addGrade,
  emptyTally,
  gradedTotal,
  sessionSurface,
} from "../study/sessionTally";
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

function studyFrontText(card: CardDraftView): string {
  if (isOcclusionFront(card.front)) {
    return card.front.prompt?.trim() || "Identify the hidden region";
  }
  return typeof card.front === "string" ? card.front : "";
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
  const fallback = backAnswer(card.back);
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

function scopeLibraryBack(scope: DueScopeOpts): {
  href: string;
  label: string;
} {
  const deck = Boolean(scope.deckId);
  const id = (deck ? scope.deckId : scope.subjectId) ?? "";
  return {
    href: deck
      ? `/library/decks/${encodeURIComponent(id)}`
      : `/library/subjects/${encodeURIComponent(id)}`,
    label: `Back to ${deck ? "deck" : "subject"}`,
  };
}

function formatLearningEta(dueAt: string, now = new Date()): string {
  const ms = Date.parse(dueAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "a moment";
  const mins = Math.max(1, Math.ceil(ms / 60_000));
  if (mins < 60) return `${mins}m`;
  return `${Math.ceil(mins / 60)}h`;
}

/** Study session: reveal answer, grade with FSRS (keys 1-4 or arrows; Space flips). Code-led MUI. */
export default function StudyPage() {
  const [queue, setQueue] = useState<CardDraftView[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
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
  const [tally, setTally] = useState(emptyTally);
  const [unlocks, setUnlocks] = useState<readonly UnlockView[]>([]);
  const [pendingLearning, setPendingLearning] = useState<
    PendingLearning<CardDraftView>[]
  >([]);
  const pendingLearningRef = useRef<PendingLearning<CardDraftView>[]>([]);
  const queueRef = useRef<CardDraftView[]>([]);
  const cardDialogOpenRef = useRef(false);
  const onCardDialogOpen = useCallback((open: boolean) => {
    cardDialogOpenRef.current = open;
  }, []);
  const introBonusRef = useRef<number | undefined>(undefined);
  if (introBonusRef.current === undefined) {
    introBonusRef.current = getIntroBonus();
  }
  const { zen, toggleZen, exitZen } = useStudyZenMode();
  const { enqueueUnlocks } = useUnlockToasts();

  const leaveStudy = useCallback(() => {
    exitZen();
    navigate("/today");
  }, [exitZen]);

  const answerFocusRef = useRef<HTMLElement | null>(null);
  const swipeHintUsedRef = useRef(false);
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
      queueRef.current = next;
      setQueue(next);
      setQueueTotal(next.length);
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

  const rememberFlushedUnlocks = useCallback((incoming: readonly unknown[]) => {
    setUnlocks((prev) => rememberIncomingUnlocks(prev, incoming));
  }, []);

  const {
    userId,
    setUserId,
    pendingCount,
    syncSummary,
    setSyncSummary,
    refreshPendingCount,
    flushOnMount,
  } = usePendingGradeSync({
    onUnlocks: rememberFlushedUnlocks,
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
  const notes = useStudyNotesOverlay(current);
  const queueFraction = studyQueueProgress(queueTotal, queue.length);
  const cardHostRef = useRef<HTMLDivElement>(null);
  const [plateWidth, setPlateWidth] = useState<number | null>(null);
  const surface = sessionSurface(
    hadCards,
    gradedTotal(tally),
    pendingLearning.length,
  );
  const nextLearningDue = earliestPendingDueAt(pendingLearning);
  const mcqMode = isMcqCard(current);
  const occlusionParts = current
    ? occlusionStudyParts(current)
    : { face: undefined, answer: "" };
  const canStudyMore = !offlineCopy && (queueMeta?.heldIntroCount ?? 0) > 0;
  const scopeBack = scopeOpts ? scopeLibraryBack(scopeOpts) : null;
  const openScopeBack = (leaveZen: boolean) => {
    if (!scopeBack) return;
    if (leaveZen) exitZen();
    navigate(scopeBack.href);
  };

  useLayoutEffect(() => {
    const host = cardHostRef.current;
    const plate = host?.querySelector<HTMLElement>(".sp-playing-card");
    if (!plate) {
      setPlateWidth(null);
      return;
    }
    const sync = () => setPlateWidth(plate.getBoundingClientRect().width);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(plate);
    return () => observer.disconnect();
  }, [current?.id, zen]);

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
  }, []);

  useEffect(() => {
    if (!revealed) return;
    answerFocusRef.current?.focus();
  }, [revealed, current?.id]);

  const commitPendingLearning = useCallback(
    (next: PendingLearning<CardDraftView>[]) => {
      pendingLearningRef.current = next;
      setPendingLearning(next);
    },
    [],
  );

  const applyMergedQueue = useCallback(
    (
      merged: {
        queue: CardDraftView[];
        pending: PendingLearning<CardDraftView>[];
      },
      prevLen: number,
    ) => {
      const added = merged.queue.length - prevLen;
      queueRef.current = merged.queue;
      setQueue(merged.queue);
      commitPendingLearning(merged.pending);
      if (added > 0) {
        setQueueTotal((total) => total + added);
        setHadCards(true);
      }
    },
    [commitPendingLearning],
  );

  const parkShortTermFollowUp = useCallback(
    (card: CardDraftView, dueIso: string, state: number | undefined) => {
      const gradedAt = new Date();
      if (isShortTermFollowUp({ dueIso, gradedAt, state })) {
        commitPendingLearning(
          upsertPendingLearning(pendingLearningRef.current, {
            cardId: card.id,
            dueAt: dueIso,
            card,
          }),
        );
      } else {
        commitPendingLearning(
          pendingLearningRef.current.filter((p) => p.cardId !== card.id),
        );
      }
    },
    [commitPendingLearning],
  );

  const flushDueLearning = useCallback(() => {
    const prev = queueRef.current;
    applyMergedQueue(
      mergeDueLearning(prev, pendingLearningRef.current, new Date()),
      prev.length,
    );
  }, [applyMergedQueue]);

  const advanceAfterGrade = useCallback(() => {
    const sliced = queueRef.current.slice(1);
    applyMergedQueue(
      mergeDueLearning(sliced, pendingLearningRef.current, new Date()),
      sliced.length,
    );
    setRevealed(false);
  }, [applyMergedQueue]);

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
        setTally((prev) => addGrade(prev, rating));
        pruneDueCacheCard(uid, current.id, scopeOpts);
        refreshPendingCount(uid);
        advanceAfterGrade();
        end();
        return true;
      };

      if (!isGuest() && offlineCopy && userId) {
        return queueOffline(userId);
      }

      try {
        const result = await reviewCard(current.id, rating, {
          localDay: clientLocalDay(),
        });
        const incoming = result.unlocks;
        if (incoming?.length) {
          enqueueUnlocks(incoming);
          setUnlocks((prev) => rememberUnlocks(prev, incoming));
        }
        setTally((prev) => addGrade(prev, rating));
        parkShortTermFollowUp(current, result.due, result.state);
        advanceAfterGrade();
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
      enqueueUnlocks,
      offlineCopy,
      parkShortTermFollowUp,
      refreshPendingCount,
      revealed,
      scopeOpts,
      userId,
    ],
  );

  useEffect(() => {
    const wake = nextLearningWakeAt(pendingLearning, new Date());
    if (!wake) return;
    const delay = Math.max(0, wake.getTime() - Date.now());
    const id = window.setTimeout(() => {
      flushDueLearning();
    }, delay);
    return () => window.clearTimeout(id);
  }, [flushDueLearning, pendingLearning]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      flushDueLearning();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [flushDueLearning]);

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
      if (cardDialogOpenRef.current) return;
      if (notes.notesOpenRef.current) {
        // Keep zen: MUI closes the dialog but does not cancel Escape.
        if (e.key === "Escape") e.preventDefault();
        return;
      }
      const key = plainShortcutKey(e);
      if (key === null) return;
      if ((key === "s" || key === "S") && revealed && notes.notesAvailable) {
        e.preventDefault();
        notes.openNotes();
        return;
      }
      if (key === "Escape") {
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
      if (key === "z" || key === "Z") {
        e.preventDefault();
        toggleZen();
        return;
      }
      if (isMcqCard(current) || busyRef.current || !current) return;
      const action = resolveStudyKey(key, revealed);
      switch (action.type) {
        case "reveal":
          e.preventDefault();
          reveal();
          return;
        case "hide":
          e.preventDefault();
          flipBack();
          return;
        case "grade":
          if (
            faceScrollsFor(
              key,
              answerFocusRef.current?.closest("[data-card-face-content]") ??
                null,
            )
          ) {
            return;
          }
          e.preventDefault();
          void onGrade(action.rating);
          return;
        case "none":
          return;
        default: {
          const unhandled: never = action;
          void unhandled;
        }
      }
    }

    // Capture so Space flips before a focused Show answer button activates.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    current,
    flipBack,
    leaveStudy,
    notes.notesAvailable,
    notes.openNotes,
    onGrade,
    ready,
    reveal,
    revealed,
    toggleZen,
  ]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
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

  const replaceQueuedCard = useCallback((updated: CardDraftView) => {
    const next = queueRef.current.map((c) =>
      c.id === updated.id ? updated : c,
    );
    queueRef.current = next;
    setQueue(next);
  }, []);

  const removeQueuedCard = useCallback((cardId: string) => {
    const next = queueRef.current.filter((c) => c.id !== cardId);
    queueRef.current = next;
    setQueue(next);
    setRevealed(false);
  }, []);

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography color="text.secondary">Loading study…</Typography>
      </Container>
    );
  }

  const stage = zen;
  const finish = !current && surface === "complete";
  const fillColumn = finish
    ? ({
        minHeight: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      } as const)
    : null;

  return (
    <Box
      className={stage ? "sp-stage" : undefined}
      sx={{
        minHeight: stage ? "100%" : fillColumn?.minHeight,
        height: stage ? "100%" : fillColumn?.height,
        display: fillColumn?.display,
        flexDirection: fillColumn?.flexDirection,
        boxSizing: "border-box",
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
          py: stage ? { xs: 1, sm: 3 } : 4,
          height: stage ? "100%" : fillColumn?.height,
          maxHeight: stage ? "100%" : undefined,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: stage ? "hidden" : undefined,
          pb: stage
            ? { xs: "max(8px, env(safe-area-inset-bottom))", sm: 3 }
            : undefined,
        }}
      >
        <Stack
          spacing={stage ? { xs: 0.75, sm: 1.5 } : 2}
          sx={stage || finish ? { flex: 1, minHeight: 0 } : undefined}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            spacing={1}
            sx={{ position: "relative", flexShrink: 0 }}
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
                    href={scopeBack!.href}
                    underline="hover"
                    onClick={(ev) => {
                      ev.preventDefault();
                      openScopeBack(false);
                    }}
                  >
                    {scopeBack!.label}
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
            ) : surface === "soft_wait" ? (
              <Stack spacing={1.5} alignItems="stretch">
                <Typography variant="body1" sx={{ textAlign: "center" }}>
                  Next learning card in{" "}
                  {nextLearningDue
                    ? formatLearningEta(nextLearningDue)
                    : "a moment"}
                  .
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ textAlign: "center", opacity: 0.8 }}
                >
                  {pendingLearning.length} learning{" "}
                  {pendingLearning.length === 1 ? "card" : "cards"} coming back.
                </Typography>
                <Button variant="contained" onClick={leaveStudy}>
                  Today
                </Button>
              </Stack>
            ) : surface === "quiet" ? (
              <Stack spacing={1.5} alignItems="stretch">
                <Typography variant="body1" sx={{ textAlign: "center" }}>
                  No cards left for now.
                </Typography>
                <Button variant="contained" onClick={leaveStudy}>
                  Today
                </Button>
                {canStudyMore ? (
                  <Button
                    variant="outlined"
                    disabled={studyMoreBusy}
                    onClick={() => void onStudyMore()}
                  >
                    {studyMoreBusy ? "Loading…" : "Study more"}
                  </Button>
                ) : null}
                {scopeBack ? (
                  <Link
                    href={scopeBack.href}
                    underline="hover"
                    onClick={(ev) => {
                      ev.preventDefault();
                      openScopeBack(true);
                    }}
                  >
                    {scopeBack.label}
                  </Link>
                ) : null}
              </Stack>
            ) : (
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "safe center",
                }}
              >
                <SessionComplete
                  zen={stage}
                  tally={tally}
                  unlocks={unlocks}
                  showAchievements={!isGuest()}
                  canStudyMore={canStudyMore}
                  studyMoreBusy={studyMoreBusy}
                  onStudyMore={() => void onStudyMore()}
                  onToday={leaveStudy}
                  onAchievements={() => {
                    exitZen();
                    navigate("/achievements");
                  }}
                  scopeBack={
                    scopeBack
                      ? { ...scopeBack, onClick: () => openScopeBack(true) }
                      : null
                  }
                />
              </Box>
            )
          ) : (
            <>
              <StudyCardActions
                card={current}
                hidden={stage}
                gradeBusy={busy}
                offlineCopy={offlineCopy}
                userId={userId}
                onDialogOpen={onCardDialogOpen}
                onSaved={(updated) => {
                  replaceQueuedCard(updated);
                  setRevealed(false);
                }}
                onRegenerated={replaceQueuedCard}
                onRemoved={removeQueuedCard}
              />
              <LinearProgress
                variant="determinate"
                value={queueFraction}
                aria-label={`${queue.length} of ${queueTotal} remaining`}
                aria-valuenow={Math.round(queueFraction)}
                aria-valuemin={0}
                aria-valuemax={100}
                sx={{
                  alignSelf: "center",
                  width: plateWidth ?? "min(100%, 360px)",
                  flexShrink: 0,
                  height: 4,
                  bgcolor: stage
                    ? "color-mix(in srgb, var(--sp-ivory) 22%, transparent)"
                    : undefined,
                  "& .MuiLinearProgress-bar": stage
                    ? { backgroundColor: "var(--sp-ivory)" }
                    : undefined,
                }}
              />

              <Box
                ref={cardHostRef}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                sx={{
                  touchAction: "manipulation",
                  display: "flex",
                  alignItems: { xs: "stretch", sm: "center" },
                  justifyContent: "center",
                  py: { xs: 0.5, sm: 2 },
                  // Plate height is a percentage of this box. Outside fullscreen
                  // there is no definite height, so flex-basis 0 clips the card.
                  ...(stage
                    ? { flex: 1, minHeight: 0, overflow: "hidden" }
                    : { flex: "0 0 auto", height: "min(68dvh, 520px)" }),
                }}
              >
                <CardFace
                  cardId={current.id}
                  front={studyFrontText(current)}
                  back={occlusionParts.answer}
                  type={current.type}
                  mediaR2Keys={current.media_r2_keys}
                  occlusion={occlusionParts.face}
                  options={current.options}
                  revealed={revealed}
                  onReveal={reveal}
                  onFlipBack={flipBack}
                  disabled={busy}
                  answerFocusRef={answerFocusRef}
                  notesAvailable={notes.notesAvailable}
                  onOpenNotes={notes.openNotes}
                  onGrade={
                    mcqMode ? (rating) => onGrade(rating, true) : undefined
                  }
                />
                {notes.dialog}
              </Box>

              {mcqMode ? (
                <Box
                  sx={{ minHeight: { xs: 64, sm: 72 }, flexShrink: 0 }}
                  aria-hidden
                />
              ) : revealed ? (
                <Box sx={{ pb: { xs: 0.5, sm: 1 }, mt: "auto", flexShrink: 0 }}>
                  <GradeButtons
                    disabled={busy}
                    onGrade={onGrade}
                    showSwipeHint={showSwipeHint}
                  />
                </Box>
              ) : (
                <Box
                  sx={{ minHeight: { xs: 64, sm: 72 }, flexShrink: 0 }}
                  aria-hidden
                />
              )}
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
