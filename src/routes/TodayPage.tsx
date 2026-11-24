import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  listDecks,
  listDueCards,
  getJourney,
  type CardDraftView,
  type StudyQueueMeta,
} from "../api/client";
import {
  consumeMergeFailedNotice,
  tryMergeGuestAfterAuth,
} from "../guest/mergeOnAuth";
import { isGuest } from "../guest/session";
import { useSession } from "../session/SessionContext";
import { deriveJourney } from "../journey/derive";
import type { JourneyView } from "../journey/types";
import JourneyNextButton from "../journey/JourneyNextButton";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useTrackedOp } from "../progress/useTrackedOp";
import {
  filterDueExcludingPending,
  loadDueCache,
  saveDueCache,
} from "../study";
import {
  buildDueBreakdown,
  type DueBreakdown,
} from "../study";
import { TodayDueBreakdown } from "../study";
import { pendingCardIdSet } from "../study";
import { usePendingGradeSync } from "../study";
import { warmDueMedia } from "../study";
import { maybeRunFsrsOptimize } from "../study";

async function loadDeckTitles(): Promise<Record<string, string>> {
  try {
    const decks = await listDecks();
    return Object.fromEntries(decks.map((d) => [d.id, d.title]));
  } catch {
    return {};
  }
}

/** Home: giant due proof + Start study (today-dash-b). */
export default function TodayPage() {
  const { user } = useSession();
  const [dueCount, setDueCount] = useState(0);
  const [breakdown, setBreakdown] = useState<DueBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mergeFailed, setMergeFailed] = useState(false);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<JourneyView | null>(null);
  const { end: endLoad } = useTrackedOp("Loading today…", {
    trackOnMount: true,
  });

  const applyDueSnapshot = useCallback(
    async (
      cards: CardDraftView[],
      meta: StudyQueueMeta | null | undefined,
      opts?: { offline?: boolean },
    ) => {
      const titles = await loadDeckTitles();
      const next = buildDueBreakdown(cards, meta, titles);
      setDueCount(cards.length);
      setBreakdown(next);
      setOfflineCopy(opts?.offline ?? false);
    },
    [],
  );

  const refreshDueFromNetwork = useCallback(
    async (uid: string) => {
      try {
        const { cards: due, meta } = await listDueCards();
        saveDueCache(uid, due);
        warmDueMedia(due);
        await applyDueSnapshot(due, meta);
      } catch {
        /* keep current due count */
      }
    },
    [applyDueSnapshot],
  );

  const {
    setUserId,
    pendingCount,
    syncSummary,
    setSyncSummary,
    refreshPendingCount,
    flushOnMount,
  } = usePendingGradeSync({
    onDueRefreshed: (due, meta) => {
      void applyDueSnapshot(due, meta);
    },
    onDueRefreshFailed: (uid) => refreshDueFromNetwork(uid),
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        // OAuth land: merge guest paste snapshot once session exists (email auth merges in register/login).
        if (!isGuest()) await tryMergeGuestAfterAuth();
        if (cancelled) return;
        if (consumeMergeFailedNotice()) setMergeFailed(true);
        setUserId(user.id);
        refreshPendingCount(user.id);
        await flushOnMount(user.id);
        if (cancelled) return;
        try {
          const { cards: due, meta } = await listDueCards();
          if (cancelled) return;
          saveDueCache(user.id, due);
          warmDueMedia(due);
          const titles = await loadDeckTitles();
          if (cancelled) return;
          setDueCount(due.length);
          setBreakdown(buildDueBreakdown(due, meta, titles));
          setOfflineCopy(false);
        } catch (err) {
          if (cancelled) return;
          const cached = loadDueCache(user.id);
          if (cached) {
            const filtered = filterDueExcludingPending(
              cached.cards,
              pendingCardIdSet(user.id),
            );
            setDueCount(filtered.length);
            setBreakdown(null);
            setOfflineCopy(true);
          } else {
            throw err;
          }
        }
        if (!cancelled) {
          refreshPendingCount(user.id);
          setReady(true);
          endLoad();
        }
        if (!cancelled) {
          const optimizeResult = await maybeRunFsrsOptimize();
          if (optimizeResult === "ran" && !cancelled) {
            try {
              const { cards: dueAfter, meta: metaAfter } = await listDueCards();
              if (!cancelled) {
                saveDueCache(user.id, dueAfter);
                setDueCount(dueAfter.length);
                const titlesAfter = await loadDeckTitles();
                if (!cancelled) {
                  setBreakdown(
                    buildDueBreakdown(dueAfter, metaAfter, titlesAfter),
                  );
                }
              }
            } catch {
              /* keep pre-optimize due snapshot */
            }
          }
        }
        try {
          const journey = await getJourney();
          if (!cancelled) setView(deriveJourney(journey));
        } catch {
          if (!cancelled) setView(null);
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
  }, [endLoad, flushOnMount, refreshPendingCount, setUserId, user]);

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Stack spacing={2} sx={{
          alignItems: "center"
        }}>
          <Skeleton variant="text" width={120} height={72} />
          <Skeleton variant="text" width={160} />
          <Skeleton
            variant="rounded"
            width="100%"
            height={48}
            sx={{ maxWidth: 280, borderRadius: 1 }}
          />
        </Stack>
      </Container>
    );
  }

  // Today is due/study, not setup. Offer a single Next CTA when idle; no stage rail.
  const showJourneyNext =
    view != null && dueCount === 0 && view.next.href !== "/today";

  const dueCaption = dueCount === 1 ? "card due" : "cards due";

  return (
    <Container
      maxWidth="sm"
      sx={(t) => ({
        py: { xs: 4, sm: 8 },
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        boxSizing: "border-box",
        ...t.applyStyles("dark", {
          backgroundImage:
            "radial-gradient(ellipse 70% 55% at 50% 38%, var(--sp-lamp-glow, rgba(196, 165, 116, 0.28)) 0%, transparent 70%)",
        }),
      })}
    >
      <Stack
        spacing={4}
        sx={{
          alignItems: "center",
          textAlign: "center",
          "@keyframes todayHeroIn": {
            from: { opacity: 0, transform: "translateY(8px)" },
            to: { opacity: 1, transform: "translateY(0)" },
          },
          "@media (prefers-reduced-motion: reduce)": {
            "@keyframes todayHeroIn": {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
          },
          animation: "todayHeroIn 400ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 420 }}>
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
              fontWeight: 400,
              letterSpacing: "0.02em",
              color: "text.primary",
              m: 0,
            }}
          >
            {dueCount > 0 ? "Ready to study" : "Caught up for now"}
          </Typography>
          <Box
            aria-hidden
            sx={{
              width: 48,
              height: "1px",
              bgcolor: "var(--sp-grade-hard-border, #c4a574)",
              mx: "auto",
              mt: 1.25,
              mb: 2,
              flexShrink: 0,
            }}
          />
          <Typography
            component="p"
            aria-label={`${dueCount} ${dueCaption}`}
            sx={{
              m: 0,
              fontSize: { xs: "5.5rem", sm: "7rem", md: "8rem" },
              fontWeight: 700,
              lineHeight: 0.92,
              letterSpacing: "-0.04em",
              color: "text.primary",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {dueCount}
          </Typography>
          <Typography
            variant="h6"
            component="p"
            sx={{
              mt: 1.25,
              fontFamily: "inherit",
              fontWeight: 500,
              color: "text.secondary",
              letterSpacing: "0.04em",
            }}
          >
            {dueCaption}
          </Typography>
          {breakdown ? (
            <TodayDueBreakdown
              introUsed={breakdown.introUsed}
              reviewUsed={breakdown.reviewUsed}
              rows={breakdown.rows}
              remainder={breakdown.remainder}
            />
          ) : null}
        </Box>

        {error ? (
          <Alert severity="error" sx={{ width: "100%", textAlign: "left" }}>
            {error}
          </Alert>
        ) : null}
        {mergeFailed ? (
          <Alert
            severity="warning"
            sx={{ width: "100%", textAlign: "left" }}
            onClose={() => setMergeFailed(false)}
          >
            Could not import your guest cards. They are still in this browser;
            try again later or paste them after signing in.
          </Alert>
        ) : null}
        {syncSummary ? (
          <Alert
            severity="info"
            sx={{ width: "100%", textAlign: "left" }}
            onClose={() => setSyncSummary(null)}
          >
            {syncSummary}
          </Alert>
        ) : null}
        {offlineCopy ? (
          <Alert severity="warning" sx={{ width: "100%", textAlign: "left" }}>
            Showing an offline copy of your due count.
            {pendingCount > 0
              ? ` ${pendingCount} ${pendingCount === 1 ? "grade" : "grades"} waiting to sync.`
              : ""}
          </Alert>
        ) : pendingCount > 0 ? (
          <Alert severity="info" sx={{ width: "100%", textAlign: "left" }}>
            {pendingCount} {pendingCount === 1 ? "grade" : "grades"} waiting to
            sync.
          </Alert>
        ) : null}

        <Stack
          direction="column"
          spacing={1.25}
          sx={{
            alignItems: "stretch",
            width: "100%",
            maxWidth: 360,
            "& .MuiButton-root": {
              py: 1.5,
              px: 3,
              fontWeight: 600,
              fontSize: "1.05rem",
              borderRadius: 1.5,
              letterSpacing: "0.04em",
            },
          }}
        >
          {dueCount > 0 ? (
            <Button
              variant="contained"
              color="primary"
              size="large"
              href="/study"
              startIcon={<PlayArrowIcon />}
            >
              Start study
            </Button>
          ) : showJourneyNext ? (
            <>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  letterSpacing: "0.02em",
                  mb: 0.5,
                }}
              >
                Next step to your first review
              </Typography>
              <JourneyNextButton
                view={view}
                onAction={(action) => {
                  if (
                    action === "create_deck" ||
                    action === "add_material" ||
                    action === "add_more"
                  ) {
                    window.location.assign("/library");
                  }
                }}
              />
            </>
          ) : (
            <>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  letterSpacing: "0.02em",
                  mb: 0.5,
                }}
              >
                Nothing due. Enjoy the break.
              </Typography>
              <Button
                variant="outlined"
                color="primary"
                size="large"
                startIcon={<NoteAddIcon />}
                href="/library"
                onClick={(ev) => {
                  ev.preventDefault();
                  window.location.assign("/library");
                }}
              >
                Add material
              </Button>
            </>
          )}
        </Stack>
      </Stack>
    </Container>
  );
}
