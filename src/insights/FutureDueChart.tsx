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
  TIP_FUTURE_DUE,
  TIP_FUTURE_DUE_PEAK,
  TIP_FUTURE_DUE_TOTAL,
} from "./metricTips";
import { insightsSectionTitleSx } from "./operatePaper";
import { shortInsightDay } from "./shortInsightDay";

type Point = { day: string; count: number };

type Props = {
  series: readonly Point[];
};

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
    label: shortInsightDay(p.day),
  }));

  return (
    <Stack spacing={1.75}>
      <Typography component="h2" sx={{ ...insightsSectionTitleSx, mb: 0 }}>
        <MetricTip title={TIP_FUTURE_DUE}>Upcoming due (14d)</MetricTip>
      </Typography>

      {total === 0 ? (
        <Box role="img" aria-label={aria}>
          <Typography variant="body2" color="text.secondary">
            No cards due in the next 14 days.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.75}>
          <Stack direction="row" spacing={2.5} useFlexGap flexWrap="wrap">
            <InsightsAliceStat
              value={total}
              label="due ahead"
              tip={TIP_FUTURE_DUE_TOTAL}
            />
            <InsightsAliceStat
              value={peak}
              label="peak day"
              tip={TIP_FUTURE_DUE_PEAK}
              accent="warning"
            />
          </Stack>

          <Box role="img" aria-label={aria} sx={{ width: "100%", height: 140 }}>
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
                  minTickGap={24}
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
                  formatter={(value) => [value ?? 0, "Due"]}
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
                  maxBarSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
