import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ProgressEvent, ProgressSnapshot } from "./types";
import {
  friendlyStageHeadline,
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
  return text.length > 100 ? text.slice(0, 97) + "…" : text;
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

const eyebrowSx = {
  m: 0,
  fontSize: "0.6875rem",
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "text.secondary",
} as const;

export default function JobProgressPanel({
  snapshot,
  fallbackLabel = "Waiting for generation…",
}: JobProgressPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!detailsOpen) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [detailsOpen]);

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

  const draftsSoFar = snapshot?.draftsSoFar ?? 0;
  const projectedCards =
    snapshot?.projectedCards != null && snapshot.projectedCards > 0
      ? snapshot.projectedCards
      : null;
  const cardFill =
    projectedCards != null
      ? Math.min(100, (100 * draftsSoFar) / projectedCards)
      : null;

  const recentEvents = (snapshot?.events ?? []).slice().reverse().slice(0, 3);
  const liveEvent = pickLiveEvent(snapshot?.events);

  const barAriaLabel = determinate
    ? `${headline}, ${Math.round(percent)}%`
    : headline;

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 440,
        mx: "auto",
        borderRadius: 2.5,
        border: "1px solid",
        borderColor: "rgba(232, 216, 199, 0.16)",
        bgcolor: "#12070f",
        px: { xs: 2.5, sm: 3 },
        py: { xs: 3, sm: 3.5 },
      }}
    >
      <Stack spacing={2.25} alignItems="center">
        {determinate ? (
          <Typography
            component="p"
            sx={{
              m: 0,
              fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
              fontWeight: 400,
              fontSize: "2.75rem",
              letterSpacing: "0.02em",
              lineHeight: 1,
              color: "text.primary",
            }}
          >
            {Math.round(percent)}%
          </Typography>
        ) : null}

        <Stack spacing={0.6} sx={{ width: "100%", alignItems: "center" }}>
          <Typography
            variant="h6"
            component="p"
            textAlign="center"
            sx={{
              m: 0,
              fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
              fontWeight: 400,
              letterSpacing: "0.02em",
              lineHeight: 1.25,
            }}
          >
            {headline}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            textAlign="center"
            sx={{ lineHeight: 1.5 }}
          >
            {subline}
          </Typography>
        </Stack>

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
            sx={{
              height: 12,
              borderRadius: 999,
              bgcolor: "rgba(232, 216, 199, 0.12)",
              "& .MuiLinearProgress-bar": {
                borderRadius: 999,
                bgcolor: "primary.main",
                transition: "transform 400ms cubic-bezier(0.2, 0, 0, 1)",
              },
            }}
          />
        </Box>

        <Button
          size="small"
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          sx={{
            color: "text.secondary",
            textTransform: "none",
            fontWeight: 500,
            letterSpacing: "0.02em",
            minWidth: 0,
            px: 1,
            "&:hover": {
              color: "text.primary",
              bgcolor: "transparent",
            },
          }}
        >
          {detailsOpen ? "Hide details" : "Show details"}
        </Button>

        {detailsOpen ? (
          <Stack
            spacing={2.25}
            sx={{
              width: "100%",
              textAlign: "left",
              pt: 1.75,
              borderTop: "1px solid",
              borderColor: "rgba(232, 216, 199, 0.12)",
            }}
          >
            {liveEvent ? (
              <Stack spacing={0.75}>
                <Typography component="p" sx={eyebrowSx}>
                  From your material
                </Typography>
                <Typography
                  sx={{
                    m: 0,
                    pl: 1.5,
                    borderLeft: "2px solid",
                    borderColor: "primary.main",
                    fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
                    fontStyle: "italic",
                    fontSize: "1.15rem",
                    lineHeight: 1.35,
                    letterSpacing: "0.01em",
                    color: "text.primary",
                  }}
                >
                  {truncateEventText(liveEvent.text)}
                </Typography>
              </Stack>
            ) : null}

            {stages.length > 0 ? (
              <Stack spacing={0.75}>
                <Typography component="p" sx={eyebrowSx}>
                  Pipeline
                </Typography>
                <Stack
                  direction="row"
                  alignItems="center"
                  useFlexGap
                  flexWrap="wrap"
                  sx={{ columnGap: 0.75, rowGap: 0.5 }}
                >
                  {stages.map((s, i) => {
                    const completed = currentIndex >= 0 && i < currentIndex;
                    const isCurrent =
                      i === currentIndex ||
                      (currentIndex === -1 && i === stages.length - 1);
                    const label = shortStageChipLabel(s);
                    return (
                      <Stack
                        key={s}
                        direction="row"
                        alignItems="center"
                        spacing={0.75}
                      >
                        {i > 0 ? (
                          <Typography
                            component="span"
                            sx={{
                              color: "rgba(232, 216, 199, 0.28)",
                              fontSize: "0.75rem",
                              lineHeight: 1,
                            }}
                          >
                            →
                          </Typography>
                        ) : null}
                        <Typography
                          component="span"
                          sx={{
                            fontSize: "0.8125rem",
                            fontWeight: isCurrent ? 600 : 500,
                            color: isCurrent
                              ? "primary.light"
                              : completed
                                ? "text.secondary"
                                : "rgba(232, 216, 199, 0.38)",
                          }}
                        >
                          {completed ? `✓ ${label}` : label}
                        </Typography>
                      </Stack>
                    );
                  })}
                </Stack>
              </Stack>
            ) : null}

            {(details.jobLine || details.freeJobsLine) && (
              <Stack spacing={1}>
                {details.jobLine ? (
                  <Box
                    sx={{
                      borderRadius: 1.75,
                      border: "1px solid",
                      borderColor: "rgba(232, 216, 199, 0.12)",
                      bgcolor: "rgba(232, 216, 199, 0.04)",
                      px: 1.75,
                      py: 1.5,
                    }}
                  >
                    <Typography component="p" sx={{ ...eyebrowSx, mb: 0.5 }}>
                      This job
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, color: "text.primary" }}
                    >
                      {details.jobLine}
                    </Typography>
                    {cardFill != null ? (
                      <LinearProgress
                        variant="determinate"
                        value={cardFill}
                        aria-label={`Cards drafted ${Math.round(cardFill)}%`}
                        sx={{
                          mt: 1.25,
                          height: 6,
                          borderRadius: 999,
                          bgcolor: "rgba(232, 216, 199, 0.1)",
                          "& .MuiLinearProgress-bar": {
                            borderRadius: 999,
                            bgcolor: "primary.main",
                          },
                        }}
                      />
                    ) : null}
                    {details.tokensLine ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", mt: 0.75 }}
                      >
                        {details.tokensLine}
                      </Typography>
                    ) : null}
                  </Box>
                ) : null}
                {details.freeJobsLine ? (
                  <Box
                    sx={{
                      borderRadius: 1.75,
                      border: "1px solid",
                      borderColor: "rgba(232, 216, 199, 0.12)",
                      bgcolor: "rgba(232, 216, 199, 0.04)",
                      px: 1.75,
                      py: 1.5,
                    }}
                  >
                    <Typography component="p" sx={{ ...eyebrowSx, mb: 0.5 }}>
                      Free today
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, color: "text.primary" }}
                    >
                      {details.freeJobsLine}
                    </Typography>
                  </Box>
                ) : null}
              </Stack>
            )}

            {!details.jobLine && details.tokensLine ? (
              <Typography variant="caption" color="text.secondary">
                {details.tokensLine}
              </Typography>
            ) : null}

            {recentEvents.length > 0 ? (
              <Stack spacing={1}>
                <Typography component="p" sx={eyebrowSx}>
                  Recent
                </Typography>
                <Stack spacing={1}>
                  {recentEvents.map((e) => {
                    const age = formatRelativeAge(nowMs - e.at);
                    const text = truncateEventText(e.text);
                    return (
                      <Box
                        key={`${e.at}-${e.stage}-${e.kind}`}
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          columnGap: 1.5,
                          rowGap: 0.25,
                          alignItems: "baseline",
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 500, color: "text.primary" }}
                        >
                          {friendlyStageHeadline(e.stage)}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ whiteSpace: "nowrap" }}
                        >
                          {age}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ gridColumn: "1 / -1", lineHeight: 1.45 }}
                        >
                          {text}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </Stack>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}
