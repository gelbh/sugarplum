import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartColors } from "./chartColors";
import { chartTooltipStyles } from "./chartTooltip";
import MetricTip from "./MetricTip";
import { TIP_SUCCESS_BY_HOUR } from "./metricTips";
import { insightsBrandSerif, insightsSectionTitleSx } from "./operatePaper";
import type { InsightsHourlySuccessPoint } from "./types";

type Props = {
  series: readonly InsightsHourlySuccessPoint[];
};

/** Ignore sparse hours so a single pass cannot win “Best hour”. */
const BEST_HOUR_MIN_N = 5;

export default function HourlySuccessChart({ series }: Props) {
  const theme = useTheme();
  const colors = useChartColors();
  const tip = chartTooltipStyles(colors);
  const tickFill = colors.textSecondary;
  const reviewed = series.reduce((sum, p) => sum + p.pass + p.fail, 0);
  const eligible = series.filter(
    (p) => p.rate != null && p.pass + p.fail >= BEST_HOUR_MIN_N,
  );
  const best = eligible.reduce<InsightsHourlySuccessPoint | null>((acc, p) => {
    if (acc == null || (p.rate ?? 0) > (acc.rate ?? 0)) return p;
    return acc;
  }, null);
  const aria =
    reviewed === 0
      ? "No reviews in the last 30 days to show hourly success"
      : `Success rate by hour of day from ${reviewed} reviews in the last 30 days`;
  const data = series.map((p) => ({
    ...p,
    label: String(p.hour),
    ratePct: p.rate == null ? 0 : Math.round(100 * p.rate),
    hasData: p.rate != null && p.pass + p.fail > 0,
  }));

  return (
    <Stack spacing={1.75}>
      <Typography component="h2" sx={{ ...insightsSectionTitleSx, mb: 0 }}>
        <MetricTip title={TIP_SUCCESS_BY_HOUR}>Success by hour</MetricTip>
      </Typography>

      {reviewed === 0 ? (
        <Box role="img" aria-label={aria}>
          <Typography variant="body2" color="text.secondary">
            No reviews yet to chart by hour.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.75}>
          <Typography variant="body2" color="text.secondary">
            {best != null && best.rate != null ? (
              <>
                Best hour (≥{BEST_HOUR_MIN_N} reviews){" "}
                <Box
                  component="span"
                  sx={{
                    fontFamily: insightsBrandSerif,
                    color: "primary.main",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {best.hour}:00
                </Box>
                {" · "}
                <Box
                  component="span"
                  sx={{
                    fontFamily: insightsBrandSerif,
                    color: "warning.main",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Math.round(100 * best.rate)}%
                </Box>
                {" · "}
              </>
            ) : null}
            <Box
              component="span"
              sx={{
                fontFamily: insightsBrandSerif,
                color: "primary.main",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {reviewed}
            </Box>{" "}
            reviews (30d)
          </Typography>

          <Box role="img" aria-label={aria} sx={{ width: "100%", height: 132 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
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
                    fontSize: 10,
                    fill: tickFill,
                    fontFamily: theme.typography.fontFamily,
                  }}
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                />
                <YAxis
                  domain={[0, 100]}
                  width={36}
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
                  radius={[3, 3, 1, 1]}
                  isAnimationActive={false}
                  maxBarSize={12}
                >
                  {data.map((row) => (
                    <Cell
                      key={row.hour}
                      fill={colors.primary}
                      fillOpacity={
                        row.hasData
                          ? best?.hour === row.hour
                            ? 1
                            : 0.72
                          : 0.18
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Local hour · empty hours stay dim, not 100%
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
