import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ProgressSnapshot } from "./types";
import { etaMs, projectTokens, remainingCardsToday } from "./estimates";

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

  const startedAt = (snapshot as any)?.startedAt as number | undefined;
  const tokensUsed = (snapshot as any)?.tokensUsed as number | undefined;
  const current = (snapshot as any)?.current as number | undefined;
  const total = (snapshot as any)?.total as number | undefined;
  const draftsSoFar = (snapshot as any)?.draftsSoFar as number | undefined;
  const freeQuota = (snapshot as any)?.freeQuota as { used: number; cap: number; remaining: number } | null | undefined;
  const events = (snapshot as any)?.events as
    | { at: number; kind: string; stage: string; text: string }[]
    | undefined;

  function fmtEta(ms: number | null | undefined) {
    if (ms == null) return "Calculating…";
    if (ms <= 1000) return "~0s";
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m > 0) return `~${m}m ${rem}s`;
    return `~${rem}s`;
  }

  let etaLabel = "Calculating…";
  if (startedAt && percent != null) {
    const e = etaMs(Date.now() - startedAt, percent);
    etaLabel = fmtEta(e);
  }
  let tokensLabel = "Calculating…";
  const projectedTokens =
    tokensUsed != null && current != null && total != null
      ? projectTokens(tokensUsed, current, total)
      : null;
  if (projectedTokens != null) tokensLabel = `${Math.round(projectedTokens)} tokens`;
  else if (tokensUsed != null) tokensLabel = `${Math.round(tokensUsed)} tokens`;

  let remainingLabel = "Calculating…";
  if (freeQuota && typeof freeQuota.remaining === "number" && freeQuota.cap > 0) {
    remainingLabel = `${freeQuota.remaining} free jobs left`;
  } else if (
    draftsSoFar != null &&
    current != null &&
    total != null
  ) {
    const rem = remainingCardsToday({
      draftsSoFar: draftsSoFar,
      current,
      total,
      freeRemaining: freeQuota?.remaining ?? 0,
      priorCardsPerJob: null,
    });
    remainingLabel = rem == null ? "Calculating…" : `${rem} cards left`;
  }

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
      <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          ETA: {etaLabel}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {tokensLabel}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {remainingLabel}
        </Typography>
      </Stack>
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
              return (
                <Typography key={i} variant="caption" color="text.secondary">
                  {e.stage} · {e.text} · {age}
                </Typography>
              );
            })}
        </Stack>
      ) : null}
    </Stack>
  );
}
