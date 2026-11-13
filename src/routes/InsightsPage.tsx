import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  getInsightsSummary,
  listStrugglingCards,
  type InsightsSummary,
  type StrugglingRow,
} from "../api/client";
import CompositionSpark from "../components/CompositionSpark";
import StrugglingList from "../components/StrugglingList";
import GradeMixChart from "../insights/GradeMixChart";
import KpiStrip from "../insights/KpiStrip";
import ReviewsPerDayChart from "../insights/ReviewsPerDayChart";
import { useTrackedOp } from "../progress/useTrackedOp";

/** Study health dashboard: KPIs, charts, and struggling cards. */
export default function InsightsPage() {
  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [rows, setRows] = useState<StrugglingRow[]>([]);
  const [strugglingError, setStrugglingError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { end: endLoad } = useTrackedOp("Loading insights…", {
    trackOnMount: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [summaryResult, strugglingResult] = await Promise.allSettled([
        getInsightsSummary(),
        listStrugglingCards(),
      ]);
      if (cancelled) return;

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
      } else {
        const err = summaryResult.reason;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setSummaryError(
          err instanceof ApiError ? err.message : "Failed to load study summary",
        );
      }

      if (strugglingResult.status === "fulfilled") {
        setRows(strugglingResult.value);
      } else {
        const err = strugglingResult.reason;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setStrugglingError(
          err instanceof ApiError
            ? err.message
            : "Failed to load struggling cards",
        );
      }

      setReady(true);
      endLoad(
        summaryResult.status === "fulfilled" ||
          strugglingResult.status === "fulfilled",
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad]);

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
              Study health, recent activity, and cards that need attention.
            </Typography>
          </Box>

          {summaryError ? <Alert severity="error">{summaryError}</Alert> : null}

          {summary ? (
            <Stack spacing={3}>
              <KpiStrip summary={summary} />
              <ReviewsPerDayChart series={summary.reviewsPerDay} />
              <GradeMixChart counts={summary.gradeCounts} />
              <Stack spacing={1}>
                <Typography variant="subtitle2" component="h2">
                  Knowledge mix
                </Typography>
                {summary.kpis.composition.total === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    No accepted cards yet.
                  </Typography>
                ) : (
                  <>
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
                  </>
                )}
              </Stack>
            </Stack>
          ) : null}

          <Box>
            <Typography variant="subtitle2" component="h2" gutterBottom>
              Struggling cards
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Cards that recently felt hard (No Idea or Tough Cookie) or are at
              risk of slipping.
            </Typography>
            {strugglingError ? (
              <Alert severity="error">{strugglingError}</Alert>
            ) : (
              <StrugglingList rows={rows} />
            )}
          </Box>
        </Stack>
      )}
    </Container>
  );
}
