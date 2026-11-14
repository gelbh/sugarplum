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
import { insightsSectionTitleSx } from "./operatePaper";

type Point = { day: string; count: number };

type Props = {
  series: readonly Point[];
  reviewsDays?: number;
  reviewsInWindow?: number;
  reviewedToday?: number;
};

function shortDay(day: string): string {
  return day.length >= 10 ? day.slice(5) : day;
}

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
    label: shortDay(p.day),
  }));
  const title =
    reviewsDays != null ? `Reviews per day (${reviewsDays}d)` : "Reviews per day";

  return (
    <Stack spacing={1}>
      <Typography
        variant="subtitle1"
        component="h2"
        sx={{ ...insightsSectionTitleSx, mb: 0.75 }}
      >
        {title}
      </Typography>
      {reviewsInWindow != null || reviewedToday != null ? (
        <Stack
          direction="row"
          spacing={2}
          useFlexGap
          flexWrap="wrap"
          sx={{ mb: 0.5 }}
        >
          {reviewsInWindow != null && reviewsDays != null ? (
            <Typography variant="body2" color="text.secondary">
              Window:{" "}
              <Box
                component="span"
                sx={{ color: "text.primary", fontWeight: 600 }}
              >
                {reviewsInWindow}
              </Box>
            </Typography>
          ) : null}
          {reviewedToday != null ? (
            <Typography variant="body2" color="text.secondary">
              Today:{" "}
              <Box
                component="span"
                sx={{ color: "text.primary", fontWeight: 600 }}
              >
                {reviewedToday}
              </Box>
            </Typography>
          ) : null}
        </Stack>
      ) : null}
      {total === 0 ? (
        <Box role="img" aria-label={aria}>
          <Typography variant="body2" color="text.secondary">
            No reviews in this window yet. Finish a study session to start the
            series.
          </Typography>
        </Box>
      ) : (
        <>
          <Box role="img" aria-label={aria} sx={{ width: "100%", height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 8, right: 4, left: -8, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke={colors.divider}
                  strokeDasharray="3 6"
                />
                <XAxis
                  dataKey="label"
                  tick={{
                    fontSize: 11,
                    fill: tickFill,
                    fontFamily: theme.typography.fontFamily,
                  }}
                  axisLine={{ stroke: colors.divider }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  allowDecimals={false}
                  width={32}
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
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {total} reviews · peak {peak}/day
          </Typography>
        </>
      )}
    </Stack>
  );
}
