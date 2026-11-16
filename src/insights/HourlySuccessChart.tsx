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
import type { InsightsHourlySuccessPoint } from "./types";

type Props = {
  series: readonly InsightsHourlySuccessPoint[];
};

export default function HourlySuccessChart({ series }: Props) {
  const theme = useTheme();
  const colors = useChartColors();
  const tip = chartTooltipStyles(colors);
  const tickFill = colors.textSecondary;
  const reviewed = series.reduce((sum, p) => sum + p.pass + p.fail, 0);
  const aria =
    reviewed === 0
      ? "No reviews in the last 30 days to show hourly success"
      : `Success rate by hour of day from ${reviewed} reviews in the last 30 days`;
  const data = series.map((p) => ({
    ...p,
    label: String(p.hour),
    ratePct: p.rate == null ? 0 : Math.round(100 * p.rate),
  }));

  return (
    <Stack spacing={1}>
      <Typography
        variant="subtitle1"
        component="h2"
        sx={{ ...insightsSectionTitleSx, mb: 0.75 }}
      >
        Success by hour
      </Typography>
      {reviewed === 0 ? (
        <Box role="img" aria-label={aria}>
          <Typography variant="body2" color="text.secondary">
            No reviews yet to chart by hour.
          </Typography>
        </Box>
      ) : (
        <>
          <Box role="img" aria-label={aria} sx={{ width: "100%", height: 140 }}>
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
                    fontSize: 10,
                    fill: tickFill,
                    fontFamily: theme.typography.fontFamily,
                  }}
                  axisLine={{ stroke: colors.divider }}
                  tickLine={false}
                  interval={2}
                />
                <YAxis
                  domain={[0, 100]}
                  width={32}
                  tick={{
                    fontSize: 11,
                    fill: tickFill,
                    fontFamily: theme.typography.fontFamily,
                  }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  cursor={tip.cursor}
                  contentStyle={tip.contentStyle}
                  labelStyle={tip.labelStyle}
                  itemStyle={tip.itemStyle}
                  formatter={(_value, _name, item) => {
                    const payload = item?.payload as
                      | InsightsHourlySuccessPoint
                      | undefined;
                    if (!payload || payload.rate == null) {
                      return ["—", "Success"];
                    }
                    return [
                      `${Math.round(100 * payload.rate)}% (${payload.pass}/${payload.pass + payload.fail})`,
                      "Success",
                    ];
                  }}
                  labelFormatter={(_, payload) => {
                    const hour = payload?.[0]?.payload?.hour;
                    return typeof hour === "number" ? `${hour}:00` : "";
                  }}
                />
                <Bar
                  dataKey="ratePct"
                  fill={colors.primary}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                  maxBarSize={14}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Typography variant="caption" color="text.secondary">
            Local hour · empty hours show as 0%, not 100%
          </Typography>
        </>
      )}
    </Stack>
  );
}
