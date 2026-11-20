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
import { ApiError } from "../api/client";
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
import { SessionComplete } from "../study";
import { SessionQuietEnd } from "../study";
import { StudyCardActions } from "../study";
import {
  emptyTally,
  gradedTotal,
  sessionSurface,
} from "../study";
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
  } = useLearningRequeue({
    queueRef,
    setQueue,
    setQueueTotal,
    setHadCards,
    setRevealed,
  });

  const queueHead = queue[0] ?? null;
  const { stage, mobile, toggleZen, exitZen } = useStudyImmersion(
    queueHead != null,
  );

  const leaveStudy = useCallback(() => {
    exitZen();
    navigate("/today");
  }, [exitZen]);

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
            spacing={1}
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
              position: "relative",
              flexShrink: 0
            }}>
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
              <Stack spacing={1.5} sx={{
                alignItems: "stretch"
              }}>
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
              <Stack spacing={1.5} sx={{
                alignItems: "stretch"
              }}>
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
              <LearningSoftWait
                pendingCount={pendingLearning.length}
                nextDueAt={nextLearningDue}
                onToday={leaveStudy}
              />
            ) : surface === "quiet" ? (
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
