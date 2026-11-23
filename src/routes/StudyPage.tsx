import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import { useUnlockToasts } from "../achievements/UnlockToastProvider";
import { rememberIncomingUnlocks } from "../achievements/rememberUnlocks";
import type { UnlockView } from "../achievements/wire";
import { CardFace } from "../study";
import { GradeButtons } from "../study";
import { FACE_SANS } from "../study";
import { useStudyCardGesture } from "../study";
import { ApiError, listDueCards } from "../api/client";
import { isGuest } from "../guest/session";
import { navigate } from "../shared/nav/navigate";
import { useSession } from "../session/SessionContext";
import { useTrackedOp } from "../progress/useTrackedOp";
import { useGradeMailboxFlight } from "../study";
import { studyQueueProgress } from "../study";
import {
  isMcqCard,
  occlusionStudyParts,
  studyFrontText,
} from "../study";
import { useStudyNotesOverlay } from "../study";
import { scopeLibraryBack } from "../study";
import { LearningSoftWait } from "../study";
import { StudyFreshEmpty } from "../study";
import { SessionComplete } from "../study";
import { SessionQuietEnd } from "../study";
import { StudyCardActions } from "../study";
import {
  emptyTally,
  gradedTotal,
  sessionSurface,
} from "../study";
import { getIntroBonus, clientLocalDay } from "../study";
import { hubDiyTypes } from "../deckHub";
import { DraftCardEditor } from "../draftReview";
import { useLearningRequeue } from "../study";
import { usePendingGradeSync } from "../study";
import { useStudyImmersion } from "../study";
import { useStudyGrade } from "../study";
import { useStudyQueueLoad } from "../study";
import { useStudySessionKeys } from "../study";

/** Study session: reveal answer, grade with FSRS (keys 1-4 or arrows; Space flips). Code-led MUI. */
export default function StudyPage() {
  const { user } = useSession();
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState(emptyTally);
  const [unlocks, setUnlocks] = useState<readonly UnlockView[]>([]);
  const cardDialogOpenRef = useRef(false);
  const onCardDialogOpen = useCallback((open: boolean) => {
    cardDialogOpenRef.current = open;
  }, []);
  const { enqueueUnlocks } = useUnlockToasts();
  const answerFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);

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

  const rememberFlushedUnlocks = useCallback((incoming: readonly unknown[]) => {
    setUnlocks((prev) => rememberIncomingUnlocks(prev, incoming));
  }, []);

  const {
    queue,
    setQueue,
    queueTotal,
    setQueueTotal,
    ready,
    setReady,
    error,
    setError,
    offlineCopy,
    deepLinkMiss,
    setDeepLinkMiss,
    scopeOpts,
    scopeLabel,
    hadCards,
    setHadCards,
    queueMeta,
    queueRef,
    load,
    onStudyMore,
  } = useStudyQueueLoad({
    setRevealed,
    beginStudyMore,
    endStudyMore,
    studyMoreBusy,
    userId: user?.id ?? null,
  });

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
      if (!user?.id) return;
      void load(user.id).catch((err) => {
        setError(
          err instanceof ApiError ? err.message : "Failed to refresh study",
        );
      });
    },
    onDueRefreshFailed: (uid) => load(uid),
  });

  const {
    pendingLearning,
    nextLearningDue,
    parkShortTermFollowUp,
    advanceAfterGrade,
    clearPendingLearning,
  } = useLearningRequeue({
    queueRef,
    setQueue,
    setQueueTotal,
    setHadCards,
    setRevealed,
  });

  const [readyDueCount, setReadyDueCount] = useState<number | null>(null);

  const queueHead = queue[0] ?? null;
  const { stage, mobile, toggleZen, exitZen } = useStudyImmersion(
    queueHead != null,
  );

  const leaveStudy = useCallback(() => {
    exitZen();
    navigate("/today");
  }, [exitZen]);

  const onStartStudyFromSoftWait = useCallback(() => {
    if (!user?.id) return;
    // Load first so queue can fill while park still holds soft_wait; clear only after success.
    void load(user.id)
      .then(() => {
        clearPendingLearning();
        setReadyDueCount(null);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError ? err.message : "Failed to refresh study",
        );
      });
  }, [clearPendingLearning, load, setError, user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    (async () => {
      try {
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
  }, [
    endLoad,
    flushOnMount,
    load,
    refreshPendingCount,
    setError,
    setReady,
    setUserId,
    user,
  ]);

  const current = queueHead;
  const notes = useStudyNotesOverlay(current);
  const queueFraction = studyQueueProgress(queueTotal, queue.length);
  const cardHostRef = useRef<HTMLDivElement>(null);
  const [plateWidth, setPlateWidth] = useState<number | null>(null);
  const surface = sessionSurface(
    hadCards,
    gradedTotal(tally),
    pendingLearning.length,
  );

  useEffect(() => {
    if (surface !== "soft_wait" || !user?.id) {
      setReadyDueCount(null);
      return;
    }
    setReadyDueCount(null);
    let cancelled = false;
    const pendingIds = new Set(pendingLearning.map((p) => p.cardId));
    const bonus = getIntroBonus();
    const dueOpts = {
      ...scopeOpts,
      localDay: clientLocalDay(),
      ...(bonus > 0 ? { introBonus: bonus } : {}),
    };
    void listDueCards(dueOpts)
      .then((res) => {
        if (cancelled) return;
        const other = res.cards.filter((c) => !pendingIds.has(c.id)).length;
        setReadyDueCount(other);
      })
      .catch(() => {
        if (!cancelled) setReadyDueCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [surface, user?.id, scopeOpts, pendingLearning]);
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
  }, [current?.id, stage]);

  const reveal = useCallback(() => {
    setRevealed(true);
  }, []);

  const flipBack = useCallback(() => {
    setRevealed(false);
  }, []);

  useEffect(() => {
    if (!revealed) return;
    answerFocusRef.current?.focus();
  }, [revealed, current?.id]);

  const { mailboxHold, flightBusyRef, playGradeMailboxMotion } =
    useGradeMailboxFlight(cardHostRef);

  const { onGrade, replaceQueuedCard, removeQueuedCard } = useStudyGrade({
    current,
    revealed,
    busyRef,
    flightBusyRef,
    begin,
    end,
    setError,
    offlineCopy,
    userId,
    scopeOpts,
    refreshPendingCount,
    enqueueUnlocks,
    setUnlocks,
    setTally,
    parkShortTermFollowUp,
    advanceAfterGrade,
    playGradeMailboxMotion,
    queueRef,
    setQueue,
    setRevealed,
  });

  useStudySessionKeys({
    ready,
    current,
    revealed,
    notes,
    leaveStudy,
    mobile,
    toggleZen,
    busyRef,
    flightBusyRef,
    reveal,
    flipBack,
    onGrade,
    cardDialogOpenRef,
    answerFocusRef,
  });

  const canCommitStudyGesture = () =>
    !busyRef.current &&
    !flightBusyRef.current &&
    !!current &&
    !isMcqCard(current);
  const cardGesture = useStudyCardGesture({
    canCommit: canCommitStudyGesture,
    blocked: () => notes.notesOpenRef.current || !canCommitStudyGesture(),
    revealed,
    onGrade: (rating) => {
      void onGrade(rating);
    },
  });

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography sx={{
          color: "text.secondary"
        }}>Loading study…</Typography>
      </Container>
    );
  }

  const finish = !current && surface === "complete";
  // Full-height column so pause surfaces can vertically center.
  const pauseFill =
    !current &&
    (finish ||
      surface === "soft_wait" ||
      surface === "quiet" ||
      !hadCards);
  const fillColumn = pauseFill
    ? ({
        minHeight: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      } as const)
    : null;

  return (
    <Box
      className={stage || finish ? "sp-stage" : undefined}
      sx={{
        minHeight: stage || finish ? "100%" : fillColumn?.minHeight,
        height: stage || finish ? "100%" : fillColumn?.height,
        display: fillColumn?.display,
        flexDirection: fillColumn?.flexDirection,
        boxSizing: "border-box",
        ...(stage || finish
          ? {
              color: "var(--sp-ivory)",
              "& .MuiIconButton-root": { color: "var(--sp-ivory)" },
              ...(surface === "soft_wait" ||
              surface === "complete" ||
              !hadCards
                ? {
                    backgroundImage:
                      "radial-gradient(ellipse 75% 58% at 50% 42%, rgba(196, 165, 116, 0.38) 0%, transparent 72%)",
                  }
                : {}),
            }
          : {}),
      }}
    >
      <Container
        maxWidth="sm"
        sx={{
          py: stage || finish ? { xs: 1, sm: 3 } : 4,
          height: stage || finish ? "100%" : fillColumn?.height,
          maxHeight: stage || finish ? "100%" : undefined,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: stage || finish ? "hidden" : undefined,
          pb: stage || finish
            ? { xs: "max(8px, env(safe-area-inset-bottom))", sm: 3 }
            : undefined,
        }}
      >
        <Stack
          spacing={stage ? { xs: 0.75, sm: 1.5 } : 2}
          sx={
            stage || pauseFill
              ? { flex: 1, minHeight: 0, height: "100%" }
              : undefined
          }
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
              position: "relative",
              flexShrink: 0
            }}>
            {stage && !mobile ? (
              <Box sx={{ width: 44, height: 44, flexShrink: 0 }} aria-hidden />
            ) : (
              <IconButton
                aria-label="Leave study"
                onClick={leaveStudy}
                color="primary"
                size="small"
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                {mobile ? (
                  <ArrowBackIcon fontSize="small" />
                ) : (
                  <CloseIcon fontSize="small" />
                )}
              </IconButton>
            )}
            {stage || finish ? (
              <Box
                sx={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  pointerEvents: "none",
                }}
              >
                <Box
                  component="img"
                  src="/logo.png"
                  alt=""
                  sx={{ height: 28, width: "auto", display: "block" }}
                />
                <Typography
                  variant="h6"
                  component="p"
                  sx={{
                    m: 0,
                    fontWeight: 400,
                    letterSpacing: "0.02em",
                    color: "var(--sp-ivory)",
                    opacity: 0.92,
                  }}
                >
                  Sugarplum
                </Typography>
              </Box>
            ) : null}
            {mobile ? (
              <Box sx={{ width: 44, height: 44, flexShrink: 0 }} aria-hidden />
            ) : (
              <IconButton
                aria-label="Fullscreen"
                onClick={toggleZen}
                color="primary"
                size="small"
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <FullscreenIcon fontSize="small" />
              </IconButton>
            )}
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
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "safe center",
                }}
              >
                <StudyFreshEmpty
                  title="Nothing due yet"
                  body="You can study held introductions early."
                  actionLabel={studyMoreBusy ? "Loading…" : "Study more"}
                  actionBusy={studyMoreBusy}
                  onAction={() => void onStudyMore()}
                />
              </Box>
            ) : !hadCards ? (
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "safe center",
                }}
              >
                <StudyFreshEmpty
                  title="Nothing due yet"
                  body="Add material to create your first cards."
                  actionLabel="Open Library"
                  onAction={() => {
                    exitZen();
                    navigate("/library");
                  }}
                />
              </Box>
            ) : surface === "soft_wait" ? (
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "safe center",
                }}
              >
                <LearningSoftWait
                  pendingCount={pendingLearning.length}
                  nextDueAt={nextLearningDue}
                  readyDueCount={readyDueCount}
                  onToday={leaveStudy}
                  onStartStudy={onStartStudyFromSoftWait}
                />
              </Box>
            ) : surface === "quiet" ? (
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "safe center",
                }}
              >
                <SessionQuietEnd
                  canStudyMore={canStudyMore}
                  studyMoreBusy={studyMoreBusy}
                  onStudyMore={() => void onStudyMore()}
                  onToday={leaveStudy}
                  scopeBack={
                    scopeBack
                      ? { ...scopeBack, onClick: () => openScopeBack(true) }
                      : null
                  }
                />
              </Box>
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
                  zen={stage || finish}
                  tally={tally}
                  unlocks={unlocks}
                  showAchievements={!isGuest()}
                  canStudyMore={canStudyMore}
                  studyMoreBusy={studyMoreBusy}
                  onStudyMore={() => void onStudyMore()}
                  onToday={leaveStudy}
                  onAchievements={() => {
                    exitZen();
                    navigate("/orchard");
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
                allowedTypes={hubDiyTypes(isGuest())}
                renderDraftCardEditor={(args) => <DraftCardEditor {...args} />}
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
                {...cardGesture.handlers}
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
                <Box
                  ref={cardGesture.plateRef}
                  sx={{
                    position: "relative",
                    display: "flex",
                    alignItems: "inherit",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                    minHeight: 0,
                  }}
                >
                  <Box
                    ref={cardGesture.stampRef}
                    aria-hidden
                    sx={{
                      position: "absolute",
                      top: 28,
                      left: "50%",
                      zIndex: 2,
                      pointerEvents: "none",
                      px: 1.5,
                      py: 0.5,
                      border: "2px solid",
                      bgcolor: "var(--sp-card-face)",
                      borderRadius: 1,
                      fontFamily: FACE_SANS,
                      fontWeight: 600,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      transform: "translateX(-50%) rotate(-8deg)",
                      // Idle hide via sx + callback ref. Do not set React `hidden`
                      // here: re-renders would re-apply it over imperative show.
                      opacity: 0,
                      visibility: "hidden",
                    }}
                  />
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
                </Box>
              </Box>
              {notes.dialog}

              {mcqMode ? (
                <Box
                  sx={{ minHeight: { xs: 64, sm: 72 }, flexShrink: 0 }}
                  aria-hidden
                />
              ) : revealed || mailboxHold ? (
                <Box sx={{ pb: { xs: 0.5, sm: 1 }, mt: "auto", flexShrink: 0 }}>
                  <GradeButtons
                    disabled={busy || mailboxHold}
                    onGrade={onGrade}
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
