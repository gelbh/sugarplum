import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartColors } from "./chartColors";
import { chartTooltipStyles } from "./chartTooltip";
import InsightsAliceStat from "./InsightsAliceStat";
import MetricTip from "./MetricTip";
import {
  TIP_REVIEWS_PEAK,
  TIP_REVIEWS_PER_DAY,
  TIP_REVIEWS_TODAY,
  TIP_REVIEWS_WINDOW,
} from "./metricTips";
import { insightsSectionTitleSx } from "./operatePaper";
import { shortInsightDay } from "./shortInsightDay";

type Point = { day: string; count: number };

type Props = {
  series: readonly Point[];
  reviewsDays?: number;
  reviewsInWindow?: number;
  reviewedToday?: number;
};

export default function ReviewsPerDayChart({
  series,
  reviewsDays,
  reviewsInWindow,
  reviewedToday,
}: Props) {
  const theme = useTheme();
  const colors = useChartColors();
  const tip = chartTooltipStyles(colors);
  const tickFill = colors.textSecondary;
  const total = series.reduce((sum, p) => sum + p.count, 0);
  const peak = series.reduce((m, p) => Math.max(m, p.count), 0);
  const aria =
    total === 0
      ? "No reviews in this window"
      : `${total} reviews over ${series.length} days, peak ${peak} in one day`;
  const data = series.map((p) => ({
    ...p,
    label: shortInsightDay(p.day),
  }));
  const title =
    reviewsDays != null ? `Reviews per day (${reviewsDays}d)` : "Reviews per day";

  return (
    <Stack spacing={1.75}>
      <Typography component="h2" sx={{ ...insightsSectionTitleSx, mb: 0 }}>
        <MetricTip title={TIP_REVIEWS_PER_DAY}>{title}</MetricTip>
      </Typography>

      {reviewsInWindow != null || reviewedToday != null || total > 0 ? (
        <Stack direction="row" spacing={2.5} useFlexGap sx={{
          flexWrap: "wrap"
        }}>
          {reviewsInWindow != null && reviewsDays != null ? (
            <InsightsAliceStat
              value={reviewsInWindow}
              label={`${reviewsDays}d window`}
              tip={TIP_REVIEWS_WINDOW}
            />
          ) : null}
          {reviewedToday != null ? (
            <InsightsAliceStat
              value={reviewedToday}
              label="today"
              tip={TIP_REVIEWS_TODAY}
              accent="warning"
            />
          ) : null}
          {total > 0 ? (
            <InsightsAliceStat
              value={peak}
              label="peak / day"
              tip={TIP_REVIEWS_PEAK}
            />
          ) : null}
        </Stack>
      ) : null}

      {total === 0 ? (
        <Box role="img" aria-label={aria}>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            No reviews in this window yet. Finish a study session to start the
            series.
          </Typography>
        </Box>
      ) : (
        <Box role="img" aria-label={aria} sx={{ width: "100%", height: 168 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 4, right: 4, left: -12, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke={colors.divider}
                strokeOpacity={0.55}
                strokeDasharray="2 5"
              />
              <XAxis
                dataKey="label"
                tick={{
                  fontSize: 11,
                  fill: tickFill,
                  fontFamily: theme.typography.fontFamily,
                }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                allowDecimals={false}
                width={28}
                tick={{
                  fontSize: 11,
                  fill: tickFill,
                  fontFamily: theme.typography.fontFamily,
                }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={tip.cursor}
                contentStyle={tip.contentStyle}
                labelStyle={tip.labelStyle}
                itemStyle={tip.itemStyle}
                formatter={(value) => [value ?? 0, "Reviews"]}
                labelFormatter={(_, payload) => {
                  const day = payload?.[0]?.payload?.day;
                  return typeof day === "string" ? day : "";
                }}
              />
              <Bar
                dataKey="count"
                fill={colors.primary}
                radius={[4, 4, 1, 1]}
                isAnimationActive={false}
                maxBarSize={22}
              />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Stack>
  );
}
