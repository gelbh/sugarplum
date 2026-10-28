import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ProgressSnapshot } from "./types";
import {
  friendlyStageHeadline,
  formatEtaSubline,
  formatRelativeAge,
  orderPresentStages,
  progressDetailsModel,
} from "./copy";

type JobProgressPanelProps = {
  snapshot: ProgressSnapshot | null;
  /** Fallback when snapshot is not yet available. */
  fallbackLabel?: string;
};

function truncateEventText(text: string): string {
  return text.length > 120 ? text.slice(0, 117) + "…" : text;
}

export default function JobProgressPanel({
  snapshot,
  fallbackLabel = "Waiting for generation…",
}: JobProgressPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const determinate = snapshot?.mode === "determinate";
  const percent = snapshot?.percent ?? 0;
  const headline = snapshot?.stage
    ? friendlyStageHeadline(snapshot.stage)
    : (snapshot?.label ?? fallbackLabel);
  const subline = formatEtaSubline(snapshot?.etaMs);

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
                  bgcolor: completed || isCurrent ? "primary.main" : "action.disabled",
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
        <Stack spacing={0.75} sx={{ width: "100%" }}>
          {details.sectionLine ? (
            <Typography variant="caption" color="text.secondary">
              {details.sectionLine}
            </Typography>
          ) : null}
          {details.jobLine ? (
            <Typography variant="caption" color="text.secondary">
              {details.jobLine}
            </Typography>
          ) : null}
          {details.tokensLine ? (
            <Typography variant="caption" color="text.secondary">
              {details.tokensLine}
            </Typography>
          ) : null}
          {details.freeJobsLine ? (
            <Typography variant="caption" color="text.secondary">
              {details.freeJobsLine}
            </Typography>
          ) : null}
          {recentEvents.length > 0 ? (
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
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
