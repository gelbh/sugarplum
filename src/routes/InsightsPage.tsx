import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ApiError, getInsightsSummary, type InsightsSummary } from "../api/client";
import CompositionSpark, {
  COMPOSITION_SEGMENT_COLORS,
} from "../components/CompositionSpark";
import EmptyNext from "../components/EmptyNext";
import { navigate } from "../nav/navigate";
import ActivityHeatmap from "../insights/ActivityHeatmap";
import GradeMixChart from "../insights/GradeMixChart";
import {
  insightsPaperSx,
  insightsSectionTitleSx,
} from "../insights/operatePaper";
import ReviewsPerDayChart from "../insights/ReviewsPerDayChart";
import { useTrackedOp } from "../progress/useTrackedOp";

const COMPOSITION_LEGEND = [
  { key: "mature", label: "Mature", color: COMPOSITION_SEGMENT_COLORS.mature },
  { key: "young", label: "Young", color: COMPOSITION_SEGMENT_COLORS.young },
  { key: "learning", label: "Learning", color: COMPOSITION_SEGMENT_COLORS.learning },
  { key: "new", label: "New", color: COMPOSITION_SEGMENT_COLORS.new },
] as const;

/** Charts-forward study-health + habit dashboard (no struggling list). */
export default function InsightsPage() {
  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { end: endLoad } = useTrackedOp("Loading insights…", {
    trackOnMount: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const value = await getInsightsSummary();
        if (cancelled) return;
        setSummary(value);
        setReady(true);
        endLoad(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setSummaryError(
          err instanceof ApiError ? err.message : "Failed to load study summary",
        );
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad]);

  const recallPct =
    summary?.kpis.avgRetrievability == null
      ? null
      : Math.round(100 * summary.kpis.avgRetrievability);

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 5 } }}>
      {!ready ? (
        <Typography color="text.secondary">Loading insights…</Typography>
      ) : (
        <Stack spacing={3}>
          <Box>
            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              sx={{ color: "text.primary", fontWeight: 600 }}
            >
              Insights
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Study health, habit, and recent activity.
            </Typography>
          </Box>

          {summaryError ? <Alert severity="error">{summaryError}</Alert> : null}

          {summary ? (
            <Stack spacing={3}>
              <Paper variant="outlined" sx={insightsPaperSx}>
                <Typography
                  variant="subtitle1"
                  component="h2"
                  sx={insightsSectionTitleSx}
                >
                  Study health
                </Typography>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={{ xs: 2.5, sm: 0 }}
                  alignItems={{ sm: "stretch" }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="h3"
                      component="p"
                      sx={{
                        fontWeight: 700,
                        lineHeight: 0.95,
                        letterSpacing: "-0.02em",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {recallPct == null ? "—" : `${recallPct}%`}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, mt: 1 }}
                    >
                      Est. recall
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 0.5, maxWidth: 36 * 8 }}
                    >
                      Average chance you remember accepted cards right now.
                    </Typography>
                  </Box>
                  {summary.gamification ? (
                    <>
                      <Divider
                        orientation="vertical"
                        flexItem
                        sx={{
                          display: { xs: "none", sm: "block" },
                          mx: 3,
                          borderColor: "divider",
                        }}
                      />
                      <Divider
                        sx={{
                          display: { xs: "block", sm: "none" },
                          borderColor: "divider",
                        }}
                      />
                      <Stack
                        direction="row"
                        spacing={3}
                        sx={{
                          alignItems: { xs: "flex-start", sm: "center" },
                          pt: { xs: 0, sm: 0.5 },
                        }}
                      >
                        <Box>
                          <Typography
                            variant="h5"
                            sx={{
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                              lineHeight: 1.1,
                            }}
                          >
                            {summary.gamification.streakCurrent}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mt: 0.5 }}
                          >
                            Day streak
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="h5"
                            sx={{
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                              lineHeight: 1.1,
                            }}
                          >
                            L{summary.gamification.level}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mt: 0.5 }}
                          >
                            {summary.gamification.xpTotal} XP
                          </Typography>
                        </Box>
                      </Stack>
                    </>
                  ) : null}
                </Stack>
              </Paper>

              <Paper variant="outlined" sx={insightsPaperSx}>
                <ReviewsPerDayChart
                  series={summary.reviewsPerDay}
                  reviewsDays={summary.window.reviewsDays}
                  reviewsInWindow={summary.kpis.reviewsInWindow}
                  reviewedToday={summary.kpis.reviewedToday}
                />
                <Box sx={{ mt: 3 }}>
                  <ActivityHeatmap series={summary.activityByDay} />
                </Box>
              </Paper>

              <Paper variant="outlined" sx={insightsPaperSx}>
                <GradeMixChart
                  counts={summary.gradeCounts}
                  gradeDays={summary.window.gradeDays}
                />
              </Paper>

              <Paper variant="outlined" sx={insightsPaperSx}>
                <Typography
                  variant="subtitle1"
                  component="h2"
                  sx={insightsSectionTitleSx}
                >
                  Knowledge mix
                </Typography>
                {summary.kpis.composition.total === 0 ? (
                  <EmptyNext
                    title="No accepted cards yet"
                    body="Accept drafts from Library to see stage mix here."
                    primary={{
                      label: "Open Library",
                      onClick: () => navigate("/library"),
                    }}
                  />
                ) : (
                  <Stack spacing={1.5}>
                    <CompositionSpark
                      new={summary.kpis.composition.new}
                      learning={summary.kpis.composition.learning}
                      young={summary.kpis.composition.young}
                      mature={summary.kpis.composition.mature}
                      total={summary.kpis.composition.total}
                      height={12}
                      maxWidth="100%"
                    />
                    <Stack
                      direction="row"
                      spacing={2}
                      useFlexGap
                      flexWrap="wrap"
                    >
                      {COMPOSITION_LEGEND.map((item) => {
                        const count = summary.kpis.composition[item.key];
                        return (
                          <Stack
                            key={item.key}
                            direction="row"
                            spacing={0.75}
                            alignItems="center"
                          >
                            <Box
                              aria-hidden
                              sx={{
                                width: 10,
                                height: 10,
                                borderRadius: 0.5,
                                bgcolor: item.color,
                                flexShrink: 0,
                              }}
                            />
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontVariantNumeric: "tabular-nums" }}
                            >
                              {item.label} {count}
                            </Typography>
                          </Stack>
                        );
                      })}
                    </Stack>
                    {summary.kpis.composition.graduatedPct != null ? (
                      <Typography variant="caption" color="text.secondary">
                        {summary.kpis.composition.graduatedPct}% graduated past
                        learning
                      </Typography>
                    ) : null}
                  </Stack>
                )}
              </Paper>
            </Stack>
          ) : null}
        </Stack>
      )}
    </Container>
  );
}
