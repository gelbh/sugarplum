import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ProgressEvent, ProgressSnapshot } from "./types";
import {
  friendlyStageHeadline,
  formatEtaCompact,
  formatProgressSubline,
  formatRelativeAge,
  orderPresentStages,
  progressDetailsModel,
  shortStageChipLabel,
} from "./copy";

type JobProgressPanelProps = {
  snapshot: ProgressSnapshot | null;
  /** Fallback when snapshot is not yet available. */
  fallbackLabel?: string;
};

function truncateEventText(text: string): string {
  return text.length > 120 ? text.slice(0, 117) + "…" : text;
}

function pickLiveEvent(
  events: ProgressEvent[] | undefined,
): ProgressEvent | null {
  if (!events || events.length === 0) return null;
  const newestFirst = events.slice().reverse();
  return (
    newestFirst.find((e) => e.kind === "draft") ??
    newestFirst.find((e) => e.kind === "excerpt") ??
    newestFirst[0] ??
    null
  );
}

export default function JobProgressPanel({
  snapshot,
  fallbackLabel = "Waiting for generation…",
}: JobProgressPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const determinate = snapshot?.mode === "determinate";
  const percent = snapshot?.percent ?? 0;
  const headline = snapshot?.label ?? fallbackLabel;
  const subline = formatProgressSubline({
    stage: snapshot?.stage,
    etaMs: snapshot?.etaMs,
  });

  const stages = orderPresentStages(snapshot?.presentStages ?? []);
  const currentStage = snapshot?.stage ?? null;
  const currentIndex = stages.findIndex((s) => s === currentStage);

  const details = progressDetailsModel({
    current: snapshot?.current,
    total: snapshot?.total,
    draftsSoFar: snapshot?.draftsSoFar,
    projectedCards: snapshot?.projectedCards,
    projectedTokens: snapshot?.projectedTokens,
    tokensUsed: snapshot?.tokensUsed,
    freeQuota: snapshot?.freeQuota ?? null,
  });

  const recentEvents = (snapshot?.events ?? []).slice().reverse().slice(0, 3);
  const liveEvent = pickLiveEvent(snapshot?.events);
  const etaCompact = formatEtaCompact(snapshot?.etaMs);
  const stageTitle = friendlyStageHeadline(snapshot?.stage);

  const metaParts = [
    details.sectionLine,
    etaCompact,
    determinate ? `${Math.round(percent)}%` : null,
  ].filter(Boolean);

  const barAriaLabel = determinate
    ? `${headline}, ${Math.round(percent)}%`
    : headline;

  return (
    <Stack spacing={2} sx={{ width: "100%", alignItems: "center" }}>
      {determinate ? (
        <Typography
          variant="h3"
          component="p"
          sx={{ fontWeight: 600, lineHeight: 1.1, m: 0 }}
        >
          {Math.round(percent)}%
        </Typography>
      ) : null}

      <Stack spacing={0.5} sx={{ width: "100%", alignItems: "center" }}>
        <Typography variant="body1" textAlign="center">
          {headline}
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          {subline}
        </Typography>
      </Stack>

      {stages.length > 0 ? (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="center"
          aria-hidden
          sx={{ py: 0.5 }}
        >
          {stages.map((s, i) => {
            const completed = currentIndex >= 0 && i < currentIndex;
            const isCurrent =
              i === currentIndex ||
              (currentIndex === -1 && i === stages.length - 1);
            return (
              <Box
                key={s}
                sx={{
                  width: isCurrent ? 10 : 8,
                  height: isCurrent ? 10 : 8,
                  borderRadius: "50%",
                  bgcolor:
                    completed || isCurrent ? "primary.main" : "action.disabled",
                  outline: isCurrent ? "2px solid" : "none",
                  outlineColor: isCurrent ? "primary.light" : undefined,
                  outlineOffset: 2,
                  opacity: completed ? 0.85 : 1,
                }}
              />
            );
          })}
        </Stack>
      ) : null}

      <Box sx={{ width: "100%" }}>
        <LinearProgress
          variant={determinate ? "determinate" : "indeterminate"}
          value={determinate ? percent : undefined}
          aria-label={barAriaLabel}
          {...(determinate
            ? {
                "aria-valuenow": Math.round(percent),
                "aria-valuemin": 0,
                "aria-valuemax": 100,
              }
            : {})}
        />
      </Box>

      <Button
        size="small"
        onClick={() => setDetailsOpen((open) => !open)}
        aria-expanded={detailsOpen}
      >
        {detailsOpen ? "Hide details" : "Show details"}
      </Button>

      {detailsOpen ? (
        <Stack spacing={1.25} sx={{ width: "100%", textAlign: "left" }}>
          <Stack spacing={0.25}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              Now
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {stageTitle}
            </Typography>
            {liveEvent ? (
              <Typography variant="body2" color="text.secondary">
                "{truncateEventText(liveEvent.text)}"
              </Typography>
            ) : null}
          </Stack>

          {metaParts.length > 0 ? (
            <Typography variant="caption" color="text.secondary">
              {metaParts.join(" · ")}
            </Typography>
          ) : null}

          {stages.length > 0 ? (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {stages.map((s, i) => {
                const completed = currentIndex >= 0 && i < currentIndex;
                const isCurrent =
                  i === currentIndex ||
                  (currentIndex === -1 && i === stages.length - 1);
                const label = shortStageChipLabel(s);
                return (
                  <Chip
                    key={s}
                    size="small"
                    label={completed ? `✓ ${label}` : label}
                    color={isCurrent ? "primary" : "default"}
                    variant={isCurrent ? "filled" : "outlined"}
                  />
                );
              })}
            </Stack>
          ) : null}

          {(details.jobLine || details.freeJobsLine) && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm:
                    details.jobLine && details.freeJobsLine
                      ? "1fr 1fr"
                      : "1fr",
                },
                gap: 1,
              }}
            >
              {details.jobLine ? (
                <Box
                  sx={{
                    bgcolor: "action.hover",
                    borderRadius: 1,
                    p: 1.25,
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    This job
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {details.jobLine}
                  </Typography>
                  {details.tokensLine ? (
                    <Typography variant="caption" color="text.secondary">
                      {details.tokensLine}
                    </Typography>
                  ) : null}
                </Box>
              ) : null}
              {details.freeJobsLine ? (
                <Box
                  sx={{
                    bgcolor: "action.hover",
                    borderRadius: 1,
                    p: 1.25,
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Free today
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {details.freeJobsLine}
                  </Typography>
                </Box>
              ) : null}
            </Box>
          )}

          {!details.jobLine && details.tokensLine ? (
            <Typography variant="caption" color="text.secondary">
              {details.tokensLine}
            </Typography>
          ) : null}

          {recentEvents.length > 0 ? (
            <Stack spacing={0.5}>
              {recentEvents.map((e) => {
                const age = formatRelativeAge(Date.now() - e.at);
                const text = truncateEventText(e.text);
                return (
                  <Typography
                    key={`${e.at}-${e.stage}-${e.kind}`}
                    variant="caption"
                    color="text.secondary"
                  >
                    {friendlyStageHeadline(e.stage)} · {text} · {age}
                  </Typography>
                );
              })}
            </Stack>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
