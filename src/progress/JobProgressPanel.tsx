import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import CheckIcon from "@mui/icons-material/Check";
import type { ProgressSnapshot } from "./types";
import { etaMs, projectTokens } from "./estimates";

type JobProgressPanelProps = {
  snapshot: ProgressSnapshot | null;
  /** Fallback when snapshot is not yet available. */
  fallbackLabel?: string;
};

export default function JobProgressPanel({
  snapshot,
  fallbackLabel = "Waiting for generation…",
}: JobProgressPanelProps) {
  const label = snapshot?.label ?? fallbackLabel;
  const determinate = snapshot?.mode === "determinate";
  const percent = snapshot?.percent ?? 0;
  const detail = snapshot?.detail;

  const startedAt = snapshot?.startedAt;
  const tokensUsed = snapshot?.tokensUsed;
  const current = snapshot?.current;
  const total = snapshot?.total;
  const freeQuota = snapshot?.freeQuota ?? null;
  const events = snapshot?.events ?? [];

  function fmtEta(ms: number | null | undefined) {
    if (ms == null) return "Calculating…";
    if (ms <= 1000) return "~0s";
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m > 0) return `~${m}m ${rem}s`;
    return `~${rem}s`;
  }

  const hookEtaMs = snapshot?.etaMs;
  let etaLabel = "Calculating…";
  if (hookEtaMs != null) {
    etaLabel = fmtEta(hookEtaMs);
  } else if (startedAt && percent != null) {
    etaLabel = fmtEta(etaMs(Date.now() - startedAt, percent));
  }

  const hookProjectedTokens = snapshot?.projectedTokens;
  const projectedTokens =
    hookProjectedTokens != null
      ? hookProjectedTokens
      : tokensUsed != null && current != null && total != null
        ? projectTokens(tokensUsed, current, total)
        : null;

  let tokensLabel = "Calculating…";
  if (projectedTokens != null) tokensLabel = `${Math.round(projectedTokens)} tokens`;
  else if (tokensUsed != null) tokensLabel = `${Math.round(tokensUsed)} tokens`;

  const remainingCardsToday = snapshot?.remainingCardsToday ?? null;

  const showRemainingLine = freeQuota != null;

  const remainingLabel = (() => {
    if (freeQuota == null) return "";
    if (remainingCardsToday != null) {
      return `${Math.round(remainingCardsToday)} cards left`;
    }
    return `${freeQuota.remaining} free jobs left`;
  })();

  // Stage timeline: derive from snapshot.presentStages (hook may provide) or from events + snapshot.stage
  const stages = (snapshot?.presentStages && snapshot.presentStages.length > 0)
    ? snapshot.presentStages
    : (() => {
        const seen = new Set<string>();
        const ordered: string[] = [];
        for (const ev of events) {
          if (ev.stage && !seen.has(ev.stage)) {
            seen.add(ev.stage);
            ordered.push(ev.stage);
          }
        }
        if (snapshot?.stage && !seen.has(snapshot.stage)) ordered.push(snapshot.stage);
        return ordered;
      })();

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
        <Typography variant="caption" color="text.secondary">
          {tokensLabel}
        </Typography>
        {showRemainingLine ? (
          <Typography variant="caption" color="text.secondary">
            {remainingLabel}
          </Typography>
        ) : null}
      </Stack>

      {stages && stages.length > 0 ? (
        <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap" }}>
          {stages.map((s, i) => {
            const completed = currentIndex >= 0 && i < currentIndex;
            const isCurrent = i === currentIndex || (currentIndex === -1 && i === stages.length - 1);
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

      {events && events.length > 0 ? (
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {events
            .slice()
            .reverse()
            .map((e, i) => {
              const ageMs = Date.now() - e.at;
              const age = ageMs < 1000 ? "just now" : `${Math.round(ageMs / 1000)}s ago`;
              const text = e.text.length > 120 ? e.text.slice(0, 117) + "…" : e.text;
              return (
                <Typography key={i} variant="caption" color="text.secondary">
                  {e.stage} · {text} · {age}
                </Typography>
              );
            })}
        </Stack>
      ) : null}
    </Stack>
  );
}
