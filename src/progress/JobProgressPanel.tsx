import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import CheckIcon from "@mui/icons-material/Check";
import type { ProgressSnapshot } from "./types";

type JobProgressPanelProps = {
  snapshot: ProgressSnapshot | null;
  /** Fallback when snapshot is not yet available. */
  fallbackLabel?: string;
};

function fmtEta(ms: number | null | undefined) {
  if (ms == null) return "Calculating…";
  if (ms <= 1000) return "~0s";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m > 0) return `~${m}m ${rem}s`;
  return `~${rem}s`;
}

export default function JobProgressPanel({
  snapshot,
  fallbackLabel = "Waiting for generation…",
}: JobProgressPanelProps) {
  const label = snapshot?.label ?? fallbackLabel;
  const determinate = snapshot?.mode === "determinate";
  const percent = snapshot?.percent ?? 0;
  const detail = snapshot?.detail;

  const tokensUsed = snapshot?.tokensUsed;
  const freeQuota = snapshot?.freeQuota ?? null;
  const events = snapshot?.events ?? [];

  const etaLabel = fmtEta(snapshot?.etaMs);

  const projectedTokens = snapshot?.projectedTokens ?? null;
  const showTokens =
    projectedTokens != null ||
    (tokensUsed != null && Number.isFinite(tokensUsed));
  const tokensLabel =
    projectedTokens != null
      ? `${Math.round(projectedTokens)} tokens`
      : tokensUsed != null
        ? `${Math.round(tokensUsed)} tokens`
        : null;

  const remainingCardsToday = snapshot?.remainingCardsToday ?? null;
  const showRemainingLine = freeQuota != null;
  const remainingLabel =
    freeQuota == null
      ? ""
      : remainingCardsToday != null
        ? `${Math.round(remainingCardsToday)} cards left`
        : `${freeQuota.remaining} free jobs left`;

  const stages = snapshot?.presentStages ?? [];
  const currentStage = snapshot?.stage ?? null;
  const currentIndex = stages.findIndex((s) => s === currentStage);

  return (
    <Stack spacing={1.5} sx={{ width: "100%" }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ width: "100%" }}>
        <LinearProgress
          variant={determinate ? "determinate" : "indeterminate"}
          value={determinate ? percent : undefined}
          aria-label={label}
          {...(determinate
            ? {
                "aria-valuenow": Math.round(percent),
                "aria-valuemin": 0,
                "aria-valuemax": 100,
              }
            : {})}
        />
      </Box>

      <Stack direction="row" spacing={2} sx={{ mt: 0.5 }} alignItems="center">
        <Typography variant="caption" color="text.secondary">
          ETA: {etaLabel}
        </Typography>
        {showTokens && tokensLabel ? (
          <Typography variant="caption" color="text.secondary">
            {tokensLabel}
          </Typography>
        ) : null}
        {showRemainingLine ? (
          <Typography variant="caption" color="text.secondary">
            {remainingLabel}
          </Typography>
        ) : null}
      </Stack>

      {stages.length > 0 ? (
        <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap" }}>
          {stages.map((s, i) => {
            const completed = currentIndex >= 0 && i < currentIndex;
            const isCurrent =
              i === currentIndex ||
              (currentIndex === -1 && i === stages.length - 1);
            return (
              <Chip
                key={s}
                size="small"
                label={s}
                icon={completed ? <CheckIcon fontSize="small" /> : undefined}
                color={isCurrent ? "primary" : "default"}
                variant={isCurrent ? "filled" : "outlined"}
              />
            );
          })}
        </Stack>
      ) : null}

      {detail ? (
        <Typography variant="caption" color="text.secondary">
          {detail}
        </Typography>
      ) : null}

      {determinate ? (
        <Typography variant="caption" color="text.secondary">
          {Math.round(percent)}%
        </Typography>
      ) : null}

      {events.length > 0 ? (
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {events
            .slice()
            .reverse()
            .map((e) => {
              const ageMs = Date.now() - e.at;
              const age =
                ageMs < 1000 ? "just now" : `${Math.round(ageMs / 1000)}s ago`;
              const text =
                e.text.length > 120 ? e.text.slice(0, 117) + "…" : e.text;
              return (
                <Typography
                  key={`${e.at}-${e.stage}-${e.kind}`}
                  variant="caption"
                  color="text.secondary"
                >
                  {e.stage} · {text} · {age}
                </Typography>
              );
            })}
        </Stack>
      ) : null}
    </Stack>
  );
}
