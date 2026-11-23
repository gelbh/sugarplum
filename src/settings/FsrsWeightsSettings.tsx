import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  getFsrsOptimizeStatus,
  resetFsrsWeights,
  type FsrsOptimizeStatus,
  type FsrsRescheduleSummary,
} from "../api/client";
import { FSRS_MIN_REVIEWS } from "../study";
import {
  maybeRunFsrsOptimize,
  runFsrsOptimizeTrainNow,
} from "../study";

function formatFsrsStatusLine(
  status: FsrsOptimizeStatus,
  training: boolean,
): string {
  const weights = status.hasCustomW
    ? "Using personal weights."
    : "Using library defaults.";
  const last = status.lastOptimizedAt
    ? new Date(status.lastOptimizedAt).toLocaleString()
    : "never";
  let phase = "Up to date.";
  if (training) phase = "Training…";
  else if (status.pending) phase = "Pending train.";
  return `Reviews: ${status.reviewCount} / ${FSRS_MIN_REVIEWS}. ${weights} Last optimized: ${last}. ${phase}`;
}

function formatRescheduleNotice(
  prefix: string,
  summary: FsrsRescheduleSummary,
): string {
  return `${prefix} Rescheduled ${summary.cardsUpdated} card(s); skipped ${summary.cardsSkipped}.`;
}

/** Settings subsection: personal FSRS-7 weight status, Run now, Reset. */
export default function FsrsWeightsSettings() {
  const [status, setStatus] = useState<FsrsOptimizeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus(await getFsrsOptimizeStatus());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const opt = await getFsrsOptimizeStatus();
        if (!cancelled) setStatus(opt);
        const result = await maybeRunFsrsOptimize();
        if (cancelled || result === "skipped") return;
        const refreshed = await getFsrsOptimizeStatus().catch(() => null);
        if (!cancelled) setStatus(refreshed);
      } catch {
        if (!cancelled) setStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box sx={{ mt: 3 }}>
      <Typography
        variant="subtitle2"
        sx={{ fontWeight: 600, mb: 1, color: "primary.main" }}
      >
        Personal FSRS weights
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          mb: 1.5
        }}>
        Sugarplum retrains FSRS-7 weights from your review history when you have
        at least {FSRS_MIN_REVIEWS} reviews. Auto-retrain waits about a month
        after the last train or reset; Run now works whenever you meet the
        review floor. Training runs in this browser after you open Today or
        Settings. Saving or resetting weights also reschedules existing cards
        from their review history.
      </Typography>
      {error ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert severity="success" sx={{ mb: 1 }}>
          {notice}
        </Alert>
      ) : null}
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        {status
          ? formatFsrsStatusLine(status, busy)
          : "Loading optimize status…"}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{
        flexWrap: "wrap"
      }}>
        <Button
          size="small"
          variant="outlined"
          disabled={busy || !status?.eligible}
          onClick={() => {
            void (async () => {
              setError(null);
              setNotice(null);
              setBusy(true);
              try {
                const rescheduled = await runFsrsOptimizeTrainNow();
                await refresh();
                setNotice(
                  formatRescheduleNotice("Weights updated.", rescheduled),
                );
              } catch (err) {
                setError(
                  err instanceof ApiError
                    ? err.message
                    : err instanceof Error
                      ? err.message
                      : "Optimize failed",
                );
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Run now
        </Button>
        <Button
          size="small"
          variant="text"
          disabled={busy || !status?.hasCustomW}
          onClick={() => {
            void (async () => {
              setError(null);
              setNotice(null);
              setBusy(true);
              try {
                const result = await resetFsrsWeights();
                await refresh();
                setNotice(
                  formatRescheduleNotice(
                    "Reset to library defaults.",
                    result.rescheduled,
                  ),
                );
              } catch (err) {
                setError(
                  err instanceof ApiError ? err.message : "Reset failed",
                );
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Reset to defaults
        </Button>
      </Stack>
    </Box>
  );
}
