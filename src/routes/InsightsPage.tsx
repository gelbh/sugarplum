import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ApiError, getInsightsSummary, type InsightsSummary } from "../api/client";
import CompositionSpark from "../components/CompositionSpark";
import ActivityHeatmap from "../insights/ActivityHeatmap";
import GradeMixChart from "../insights/GradeMixChart";
import ReviewsPerDayChart from "../insights/ReviewsPerDayChart";
import { useTrackedOp } from "../progress/useTrackedOp";

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
              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <Typography
                  variant="subtitle2"
                  component="h2"
                  sx={{ color: "primary.main", fontWeight: 600, mb: 1 }}
                >
                  Study health
                </Typography>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={3}
                  alignItems={{ sm: "flex-end" }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="h3"
                      component="p"
                      sx={{
                        fontWeight: 700,
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {recallPct == null ? "—" : `${recallPct}%`}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                      Est. recall
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Average chance you remember accepted cards right now.
                    </Typography>
                  </Box>
                  {summary.gamification ? (
                    <Stack direction="row" spacing={3}>
                      <Box>
                        <Typography
                          variant="h5"
                          sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                        >
                          {summary.gamification.streakCurrent}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Streak
                        </Typography>
                      </Box>
                      <Box>
                        <Typography
                          variant="h5"
                          sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                        >
                          L{summary.gamification.level}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {summary.gamification.xpTotal} XP
                        </Typography>
                      </Box>
                    </Stack>
                  ) : null}
                </Stack>
              </Paper>

              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{ mb: 1.5 }}
                  useFlexGap
                  flexWrap="wrap"
                >
                  <Typography variant="body2" color="text.secondary">
                    Reviews ({summary.window.reviewsDays}d):{" "}
                    <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
                      {summary.kpis.reviewsInWindow}
                    </Box>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Today:{" "}
                    <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
                      {summary.kpis.reviewedToday}
                    </Box>
                  </Typography>
                </Stack>
                <ReviewsPerDayChart
                  series={summary.reviewsPerDay}
                  reviewsDays={summary.window.reviewsDays}
                />
              </Paper>

              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <ActivityHeatmap series={summary.activityByDay} />
              </Paper>

              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <GradeMixChart
                  counts={summary.gradeCounts}
                  gradeDays={summary.window.gradeDays}
                />
              </Paper>

              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <Typography
                  variant="subtitle2"
                  component="h2"
                  sx={{ color: "primary.main", fontWeight: 600 }}
                >
                  Knowledge mix
                </Typography>
                {summary.kpis.composition.total === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    No accepted cards yet.
                  </Typography>
                ) : (
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    <CompositionSpark
                      new={summary.kpis.composition.new}
                      learning={summary.kpis.composition.learning}
                      young={summary.kpis.composition.young}
                      mature={summary.kpis.composition.mature}
                      total={summary.kpis.composition.total}
                      height={10}
                      maxWidth="100%"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {summary.kpis.composition.mature} mature ·{" "}
                      {summary.kpis.composition.young} young ·{" "}
                      {summary.kpis.composition.learning} learning ·{" "}
                      {summary.kpis.composition.new} new
                      {summary.kpis.composition.graduatedPct != null
                        ? ` · ${summary.kpis.composition.graduatedPct}% graduated`
                        : ""}
                    </Typography>
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
