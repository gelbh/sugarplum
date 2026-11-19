import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  getInsightsSummary,
  getStudyPrefs,
} from "../api/client";
import CompositionSpark, {
  COMPOSITION_SEGMENT_COLORS,
} from "../materials/CompositionSpark";
import EmptyNext from "../deckHub/EmptyNext";
import { navigate } from "../shared/nav/navigate";
import ActivityHeatmap from "../insights/ActivityHeatmap";
import {
  INSIGHTS_RANGE_PRESETS,
  type InsightsRangePreset,
} from "../insights/buildSeries";
import DifficultyStabilityBlock from "../insights/DifficultyStabilityBlock";
import FutureDueChart from "../insights/FutureDueChart";
import HourlySuccessChart from "../insights/HourlySuccessChart";
import GradeMixByMaturityChart from "../insights/GradeMixByMaturityChart";
import GradeMixChart from "../insights/GradeMixChart";
import InsightsAliceStat from "../insights/InsightsAliceStat";
import MetricTip from "../insights/MetricTip";
import {
  TIP_GRADUATED,
  TIP_STAGE_LEARNING,
  TIP_STAGE_MATURE,
  TIP_STAGE_NEW,
  TIP_STAGE_YOUNG,
} from "../insights/metricTips";
import SubjectDifficultyStabilityList from "../insights/SubjectDifficultyStabilityList";
import {
  insightsBandTitleSx,
  insightsPageTitleSx,
  insightsPaperSx,
} from "../insights/operatePaper";
import ReviewsPerDayChart from "../insights/ReviewsPerDayChart";
import VerdictHero from "../insights/VerdictHero";
import { useTrackedOp } from "../progress/useTrackedOp";

const COMPOSITION_LEGEND = [
  {
    key: "mature",
    label: "Mature",
    color: COMPOSITION_SEGMENT_COLORS.mature,
    tip: TIP_STAGE_MATURE,
  },
  {
    key: "young",
    label: "Young",
    color: COMPOSITION_SEGMENT_COLORS.young,
    tip: TIP_STAGE_YOUNG,
  },
  {
    key: "learning",
    label: "Learning",
    color: COMPOSITION_SEGMENT_COLORS.learning,
    tip: TIP_STAGE_LEARNING,
  },
  {
    key: "new",
    label: "New",
    color: COMPOSITION_SEGMENT_COLORS.new,
    tip: TIP_STAGE_NEW,
  },
] as const;

const RANGE_LABELS: Record<InsightsRangePreset, string> = {
  30: "30d",
  90: "90d",
  365: "365d",
};

/** Verdict-led study-health dashboard (mix composition; no struggling list). */
export default function InsightsPage() {
  const [summary, setSummary] = useState<
    Awaited<ReturnType<typeof getInsightsSummary>> | null
  >(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [desiredRetention, setDesiredRetention] = useState<number | null>(null);
  const [rangeDays, setRangeDays] = useState<InsightsRangePreset>(30);
  const [ready, setReady] = useState(false);
  const { end: endLoad } = useTrackedOp("Loading insights…", {
    trackOnMount: true,
  });

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const [value, prefsResult] = await Promise.all([
          getInsightsSummary({ rangeDays }),
          getStudyPrefs().then(
            (prefs) => ({ ok: true as const, prefs }),
            () => ({ ok: false as const }),
          ),
        ]);
        if (cancelled) return;
        setSummary(value);
        if (
          prefsResult.ok &&
          typeof prefsResult.prefs.desiredRetention === "number" &&
          Number.isFinite(prefsResult.prefs.desiredRetention)
        ) {
          setDesiredRetention(prefsResult.prefs.desiredRetention);
        } else {
          setDesiredRetention(null);
        }
        setSummaryError(null);
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
  }, [endLoad, rangeDays]);

  const recallPct =
    summary?.kpis.avgRetrievability == null
      ? null
      : Math.round(100 * summary.kpis.avgRetrievability);
  const retentionPct =
    summary?.kpis.trueRetention.overall.rate == null
      ? null
      : Math.round(100 * summary.kpis.trueRetention.overall.rate);
  const targetRetentionPct =
    desiredRetention == null ? null : Math.round(100 * desiredRetention);
  const youngPct =
    summary?.kpis.trueRetention.young.rate == null
      ? null
      : Math.round(100 * summary.kpis.trueRetention.young.rate);
  const maturePct =
    summary?.kpis.trueRetention.mature.rate == null
      ? null
      : Math.round(100 * summary.kpis.trueRetention.mature.rate);
  const etkDisplay =
    summary?.kpis.etk == null
      ? null
      : Math.round(summary.kpis.etk * 10) / 10;
  const consistencyPct =
    summary?.kpis.consistency.score == null
      ? null
      : Math.round(100 * summary.kpis.consistency.score);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4.5 } }}>
      {!ready ? (
        <Typography sx={{
          color: "text.secondary"
        }}>Loading insights…</Typography>
      ) : (
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{
              alignItems: { sm: "flex-end" },
              justifyContent: "space-between"
            }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h3" component="h1" sx={insightsPageTitleSx}>
                Insights
              </Typography>
              <Box
                aria-hidden
                sx={{
                  mt: 1.75,
                  width: 48,
                  height: 3,
                  borderRadius: 1,
                  bgcolor: "secondary.main",
                }}
              />
            </Box>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={rangeDays}
              onChange={(_e, next: InsightsRangePreset | null) => {
                if (next != null) setRangeDays(next);
              }}
              aria-label="Insights history range"
              sx={{
                flexShrink: 0,
                "& .MuiToggleButton-root": {
                  px: 1.5,
                  fontWeight: 600,
                  borderColor: "divider",
                },
                "& .Mui-selected": {
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "&:hover": {
                    bgcolor: "primary.main",
                  },
                },
              }}
            >
              {INSIGHTS_RANGE_PRESETS.map((days) => (
                <ToggleButton key={days} value={days}>
                  {RANGE_LABELS[days]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>

          {summaryError ? <Alert severity="error">{summaryError}</Alert> : null}

          {summary ? (
            <Stack spacing={3.5}>
              <VerdictHero
                recallPct={recallPct}
                retentionPct={retentionPct}
                targetRetentionPct={targetRetentionPct}
                youngPct={youngPct}
                maturePct={maturePct}
                dueToday={summary.kpis.dueToday}
                overdue={summary.kpis.overdue}
                etkDisplay={etkDisplay}
                consistencyPct={consistencyPct}
                streakCurrent={summary.gamification?.streakCurrent}
                streakBest={summary.gamification?.streakBest}
                level={summary.gamification?.level}
                xpTotal={summary.gamification?.xpTotal}
                showGamification={Boolean(summary.gamification)}
              />

              <Box>
                <Typography component="h2" sx={insightsBandTitleSx}>
                  Recent activity
                </Typography>
                <Paper variant="outlined" sx={insightsPaperSx}>
                  <Stack spacing={2.75}>
                    <ReviewsPerDayChart
                      series={summary.reviewsPerDay}
                      reviewsDays={summary.window.reviewsDays}
                      reviewsInWindow={summary.kpis.reviewsInWindow}
                      reviewedToday={summary.kpis.reviewedToday}
                    />
                    <DividerHairline />
                    <FutureDueChart series={summary.futureDue} />
                    <DividerHairline />
                    <HourlySuccessChart series={summary.hourlySuccess} />
                    <DividerHairline />
                    <ActivityHeatmap
                      series={summary.activityByDay}
                      consistencyActiveDays={
                        summary.kpis.consistency.activeDays
                      }
                      consistencyWindowDays={
                        summary.kpis.consistency.windowDays
                      }
                      consistencyPct={consistencyPct}
                      dailyLoad={summary.kpis.dailyLoad}
                    />
                  </Stack>
                </Paper>
              </Box>

              <Box>
                <Typography component="h2" sx={insightsBandTitleSx}>
                  Grades
                </Typography>
                <Paper variant="outlined" sx={insightsPaperSx}>
                  <Stack spacing={2.75}>
                    <GradeMixChart
                      counts={summary.gradeCounts}
                      gradeDays={summary.window.gradeDays}
                    />
                    <DividerHairline />
                    <GradeMixByMaturityChart
                      byMaturity={summary.gradeCountsByMaturity}
                      gradeDays={summary.window.gradeDays}
                    />
                  </Stack>
                </Paper>
              </Box>

              <Box>
                <Typography component="h2" sx={insightsBandTitleSx}>
                  Knowledge mix
                </Typography>
                <Paper variant="outlined" sx={insightsPaperSx}>
                  <Stack spacing={2.75}>
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
                          height={16}
                          maxWidth="100%"
                        />
                        <Stack
                          direction="row"
                          spacing={2.25}
                          useFlexGap
                          sx={{
                            flexWrap: "wrap",
                            alignItems: "baseline"
                          }}>
                          {COMPOSITION_LEGEND.map((item) => {
                            const count = summary.kpis.composition[item.key];
                            return (
                              <Stack
                                key={item.key}
                                direction="row"
                                spacing={0.75}
                                sx={{
                                  alignItems: "baseline"
                                }}
                              >
                                <Box
                                  aria-hidden
                                  sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 0.5,
                                    bgcolor: item.color,
                                    flexShrink: 0,
                                    alignSelf: "center",
                                  }}
                                />
                                <InsightsAliceStat
                                  size="sm"
                                  value={count}
                                  label={item.label}
                                  tip={item.tip}
                                />
                              </Stack>
                            );
                          })}
                        </Stack>
                        {summary.kpis.composition.graduatedPct != null ? (
                          <Typography
                            variant="body2"
                            sx={{
                              color: "text.secondary",
                              pt: 0.25
                            }}>
                            <Box
                              component="span"
                              sx={{
                                fontFamily:
                                  '"Alice", "Georgia", "Times New Roman", serif',
                                color: "secondary.main",
                                fontSize: "1.15rem",
                                mr: 0.75,
                              }}
                            >
                              {summary.kpis.composition.graduatedPct}%
                            </Box>
                            <MetricTip title={TIP_GRADUATED}>
                              graduated past learning
                            </MetricTip>
                          </Typography>
                        ) : null}
                      </Stack>
                    )}
                    <DividerHairline />
                    <DifficultyStabilityBlock
                      difficulty={summary.kpis.difficulty}
                      stability={summary.kpis.stability}
                    />
                    {summary.kpis.subjectDifficultyStability.length > 0 ? (
                      <>
                        <DividerHairline />
                        <SubjectDifficultyStabilityList
                          rows={summary.kpis.subjectDifficultyStability}
                        />
                      </>
                    ) : null}
                  </Stack>
                </Paper>
              </Box>
            </Stack>
          ) : null}
        </Stack>
      )}
    </Container>
  );
}

function DividerHairline() {
  return (
    <Box
      aria-hidden
      sx={{
        height: 1,
        bgcolor: "divider",
        opacity: 0.9,
      }}
    />
  );
}
