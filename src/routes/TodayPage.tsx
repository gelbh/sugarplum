import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  listDueCards,
  listStrugglingCards,
  me,
  getJourney,
  type StrugglingRow,
} from "../api/client";
import { isGuest } from "../guest/session";
import { deriveJourney } from "../journey/derive";
import type { JourneyView } from "../journey/types";
import JourneyNextButton from "../components/JourneyNextButton";
import StrugglingList from "../components/StrugglingList";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { useTrackedOp } from "../progress/useTrackedOp";
import { loadDueCache, saveDueCache } from "../study/dueCache";
import { listPendingGrades } from "../study/pendingGrades";
import {
  formatFlushSummary,
  runPendingFlush,
  type FlushSummary,
} from "../study/runPendingFlush";
import { warmDueMedia } from "../study/warmDueMedia";

/** Home: giant due proof + Start study (today-dash-b). */
export default function TodayPage() {
  const [dueCount, setDueCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<JourneyView | null>(null);
  /** undefined = hide (loading/fail); array = show section (may be empty). */
  const [struggling, setStruggling] = useState<StrugglingRow[] | undefined>(
    undefined,
  );
  const { end: endLoad } = useTrackedOp("Loading today…", {
    trackOnMount: true,
  });

  const refreshPendingCount = useCallback((uid: string) => {
    setPendingCount(listPendingGrades(uid).length);
  }, []);

  const applyFlushSummary = useCallback((summary: FlushSummary | null) => {
    if (!summary) return;
    if (summary.applied <= 0 && summary.skipped <= 0) return;
    setSyncSummary(formatFlushSummary(summary));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await me();
        if (cancelled) return;
        setUserId(user.id);
        refreshPendingCount(user.id);
        if (!isGuest()) {
          try {
            const summary = await runPendingFlush(user.id);
            if (!cancelled) {
              applyFlushSummary(summary);
              refreshPendingCount(user.id);
            }
          } catch {
            /* still load due / offline copy */
          }
        }
        try {
          const due = await listDueCards();
          if (cancelled) return;
          saveDueCache(user.id, due);
          warmDueMedia(due);
          setDueCount(due.length);
          setOfflineCopy(false);
        } catch (err) {
          if (cancelled) return;
          const cached = loadDueCache(user.id);
          if (cached) {
            setDueCount(cached.cards.length);
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
        try {
          const journey = await getJourney();
          if (!cancelled) setView(deriveJourney(journey));
        } catch {
          if (!cancelled) setView(null);
        }
        try {
          const rows = await listStrugglingCards();
          if (!cancelled) setStruggling(rows);
        } catch {
          if (!cancelled) setStruggling(undefined);
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
  }, [applyFlushSummary, endLoad, refreshPendingCount]);

  useEffect(() => {
    if (!userId || isGuest()) return;

    function onOnline() {
      if (!userId) return;
      void (async () => {
        try {
          const summary = await runPendingFlush(userId);
          applyFlushSummary(summary);
          refreshPendingCount(userId);
        } catch {
          /* keep current due count */
        }
      })();
    }

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [applyFlushSummary, refreshPendingCount, userId]);

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography color="text.secondary">Loading today…</Typography>
      </Container>
    );
  }

  // Today is due/study, not setup. Offer a single Next CTA when idle; no stage rail.
  const showJourneyNext =
    view != null && dueCount === 0 && view.next.href !== "/today";

  const dueCaption = dueCount === 1 ? "card due" : "cards due";
  const strugglingTop =
    struggling === undefined ? undefined : struggling.slice(0, 5);

  return (
    <Container
      maxWidth="sm"
      sx={{
        py: { xs: 6, md: 8 },
        minHeight: { md: "calc(100vh - 32px)" },
        display: "flex",
        flexDirection: "column",
        justifyContent: { md: strugglingTop !== undefined ? "flex-start" : "center" },
      }}
    >
      <Stack spacing={3} alignItems="center" textAlign="center">
        <Box>
          <Typography
            component="p"
            aria-label={`${dueCount} ${dueCaption}`}
            sx={{
              m: 0,
              fontSize: { xs: "5.5rem", sm: "7rem", md: "8rem" },
              fontWeight: 700,
              lineHeight: 0.95,
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
              mt: 1,
              fontFamily: "inherit",
              fontWeight: 500,
              color: "text.primary",
              letterSpacing: "0.02em",
            }}
          >
            {dueCaption}
          </Typography>
        </Box>

        {error ? (
          <Alert severity="error" sx={{ width: "100%", textAlign: "left" }}>
            {error}
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
            {pendingCount}{" "}
            {pendingCount === 1 ? "grade" : "grades"} waiting to sync.
          </Alert>
        ) : null}

        <Stack
          direction="column"
          spacing={1.5}
          alignItems="stretch"
          sx={{ width: "100%", maxWidth: 360 }}
        >
          {dueCount > 0 ? (
            <Button
              variant="contained"
              color="primary"
              size="large"
              href="/study"
              startIcon={<PlayArrowIcon />}
              sx={{
                py: 1.5,
                px: 3,
                fontWeight: 600,
                fontSize: "1.05rem",
                borderRadius: 1.5,
              }}
            >
              Start study
            </Button>
          ) : null}
          {showJourneyNext ? (
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
          ) : null}
        </Stack>

        {strugglingTop !== undefined ? (
          <Box sx={{ width: "100%", maxWidth: 480, pt: 2, textAlign: "left" }}>
            <Stack
              direction="row"
              alignItems="baseline"
              justifyContent="space-between"
              sx={{ mb: 1.5 }}
            >
              <Typography
                variant="h6"
                component="h2"
                sx={{ fontWeight: 600, color: "text.primary" }}
              >
                Struggling
              </Typography>
              <Link href="/insights" underline="hover" variant="body2">
                View all
              </Link>
            </Stack>
            <StrugglingList rows={strugglingTop} />
          </Box>
        ) : null}
      </Stack>
    </Container>
  );
}
