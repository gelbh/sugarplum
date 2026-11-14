import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { gradeChartFill } from "../study/gradeColors";
import { GRADE_LABELS } from "../study/gradeLabels";
import type { InsightsGradeCounts } from "./types";

type Props = {
  counts: InsightsGradeCounts;
  gradeDays?: number;
};

const ROWS: Array<{ key: keyof InsightsGradeCounts; rating: 1 | 2 | 3 | 4 }> = [
  { key: "again", rating: 1 },
  { key: "hard", rating: 2 },
  { key: "good", rating: 3 },
  { key: "easy", rating: 4 },
];

export default function GradeMixChart({ counts, gradeDays = 14 }: Props) {
  const theme = useTheme();
  const total = counts.again + counts.hard + counts.good + counts.easy;
  const aria =
    total === 0
      ? "No grades in this window"
      : `Grade mix: ${GRADE_LABELS[1]} ${counts.again}, ${GRADE_LABELS[2]} ${counts.hard}, ${GRADE_LABELS[3]} ${counts.good}, ${GRADE_LABELS[4]} ${counts.easy}`;

  const data = ROWS.map(({ key, rating }) => ({
    key,
    name: GRADE_LABELS[rating],
    count: counts[key],
    fill: gradeChartFill(rating),
  }));

  return (
    <Stack spacing={1}>
      <Typography
        variant="subtitle2"
        component="h2"
        sx={{ color: "primary.main", fontWeight: 600 }}
      >
        Grade mix ({gradeDays}d)
      </Typography>
      {total === 0 ? (
        <Box role="img" aria-label={aria}>
          <Typography variant="caption" color="text.secondary">
            No grades in this window yet.
          </Typography>
        </Box>
      ) : (
        <>
          <Box role="img" aria-label={aria} sx={{ width: "100%", height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={data}
                margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 11, fill: theme.palette.text.secondary }}
                />
                <Tooltip formatter={(value) => [value ?? 0, "Count"]} />
                <Bar dataKey="count" radius={[0, 2, 2, 0]} isAnimationActive={false}>
                  {data.map((row) => (
                    <Cell key={row.key} fill={row.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {total} grades in the last {gradeDays} days
          </Typography>
        </>
      )}
    </Stack>
  );
}
