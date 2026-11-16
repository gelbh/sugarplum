import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { gradeChartFill } from "../study/gradeColors";
import { GRADE_LABELS } from "../study/gradeLabels";
import { useChartColors } from "./chartColors";
import { chartTooltipStyles } from "./chartTooltip";
import { insightsSectionTitleSx } from "./operatePaper";
import type { InsightsGradeByMaturity, InsightsGradeCounts } from "./types";

type Props = {
  byMaturity: InsightsGradeByMaturity;
  gradeDays?: number;
};

const GROUPS: Array<{
  key: keyof InsightsGradeByMaturity;
  label: string;
}> = [
  { key: "young", label: "Young" },
  { key: "mature", label: "Mature" },
  { key: "learning", label: "Learning" },
];

const GRADES: Array<{ key: keyof InsightsGradeCounts; rating: 1 | 2 | 3 | 4 }> =
  [
    { key: "again", rating: 1 },
    { key: "hard", rating: 2 },
    { key: "good", rating: 3 },
    { key: "easy", rating: 4 },
  ];

function groupTotal(counts: InsightsGradeCounts): number {
  return counts.again + counts.hard + counts.good + counts.easy;
}

export default function GradeMixByMaturityChart({
  byMaturity,
  gradeDays = 14,
}: Props) {
  const theme = useTheme();
  const colors = useChartColors();
  const tip = chartTooltipStyles(colors);
  const total =
    groupTotal(byMaturity.young) +
    groupTotal(byMaturity.mature) +
    groupTotal(byMaturity.learning);
  const aria =
    total === 0
      ? "No maturity-split grades in this window"
      : `Grade mix by maturity: Young ${groupTotal(byMaturity.young)}, Mature ${groupTotal(byMaturity.mature)}, Learning ${groupTotal(byMaturity.learning)}`;

  const data = GROUPS.map(({ key, label }) => ({
    name: label,
    again: byMaturity[key].again,
    hard: byMaturity[key].hard,
    good: byMaturity[key].good,
    easy: byMaturity[key].easy,
  }));

  return (
    <Stack spacing={1} sx={{ mt: 3 }}>
      <Typography
        variant="subtitle1"
        component="h3"
        sx={{ ...insightsSectionTitleSx, mb: 0.75 }}
      >
        Grade mix by maturity ({gradeDays}d)
      </Typography>
      {total === 0 ? (
        <Box role="img" aria-label={aria}>
          <Typography variant="body2" color="text.secondary">
            No young, mature, or learning grades in this window yet.
          </Typography>
        </Box>
      ) : (
        <>
          <Box role="img" aria-label={aria} sx={{ width: "100%", height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke={colors.divider}
                  strokeDasharray="3 6"
                />
                <XAxis
                  dataKey="name"
                  tick={{
                    fontSize: 12,
                    fill: colors.textPrimary,
                    fontFamily: theme.typography.fontFamily,
                  }}
                  axisLine={{ stroke: colors.divider }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  width={32}
                  tick={{
                    fontSize: 11,
                    fill: colors.textSecondary,
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
                />
                <Legend
                  wrapperStyle={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    fontFamily: theme.typography.fontFamily,
                  }}
                />
                {GRADES.map(({ key, rating }) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={GRADE_LABELS[rating]}
                    stackId="grades"
                    fill={gradeChartFill(rating)}
                    isAnimationActive={false}
                    maxBarSize={48}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {total} grades split by maturity in the last {gradeDays} days
          </Typography>
        </>
      )}
    </Stack>
  );
}
