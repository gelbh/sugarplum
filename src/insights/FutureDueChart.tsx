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
};

function shortDay(day: string): string {
  return day.length >= 10 ? day.slice(5) : day;
}

export default function FutureDueChart({ series }: Props) {
  const theme = useTheme();
  const colors = useChartColors();
  const tip = chartTooltipStyles(colors);
  const tickFill = colors.textSecondary;
  const total = series.reduce((sum, p) => sum + p.count, 0);
  const peak = series.reduce((m, p) => Math.max(m, p.count), 0);
  const aria =
    total === 0
      ? "No upcoming due cards in the next 14 days"
      : `${total} cards due over the next ${series.length} days, peak ${peak} in one day`;
  const data = series.map((p) => ({
    ...p,
    label: shortDay(p.day),
  }));

  return (
    <Stack spacing={1}>
      <Typography
        variant="subtitle1"
        component="h2"
        sx={{ ...insightsSectionTitleSx, mb: 0.75 }}
      >
        Upcoming due (14d)
      </Typography>
      {total === 0 ? (
        <Box role="img" aria-label={aria}>
          <Typography variant="body2" color="text.secondary">
            No cards due in the next 14 days.
          </Typography>
        </Box>
      ) : (
        <>
          <Box role="img" aria-label={aria} sx={{ width: "100%", height: 160 }}>
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
                  minTickGap={24}
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
                  formatter={(value) => [value ?? 0, "Due"]}
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
                  maxBarSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {total} due · peak {peak}/day
          </Typography>
        </>
      )}
    </Stack>
  );
}
