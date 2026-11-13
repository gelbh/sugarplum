import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { GRADE_LABELS } from "../study/gradeLabels";
import type { InsightsGradeCounts } from "./types";

type Props = {
  counts: InsightsGradeCounts;
};

const ROWS: Array<{ key: keyof InsightsGradeCounts; rating: 1 | 2 | 3 | 4; color: string }> = [
  { key: "again", rating: 1, color: "error.main" },
  { key: "hard", rating: 2, color: "warning.main" },
  { key: "good", rating: 3, color: "info.main" },
  { key: "easy", rating: 4, color: "success.main" },
];

export default function GradeMixChart({ counts }: Props) {
  const total = counts.again + counts.hard + counts.good + counts.easy;
  const peak = Math.max(counts.again, counts.hard, counts.good, counts.easy, 0);
  const aria =
    total === 0
      ? "No grades in this window"
      : `Grade mix: ${GRADE_LABELS[1]} ${counts.again}, ${GRADE_LABELS[2]} ${counts.hard}, ${GRADE_LABELS[3]} ${counts.good}, ${GRADE_LABELS[4]} ${counts.easy}`;

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2" component="h2">
        Grade mix (14d)
      </Typography>
      <Stack
        role="img"
        aria-label={aria}
        spacing={0.75}
        sx={{ width: "100%" }}
      >
        {ROWS.map(({ key, rating, color }) => {
          const n = counts[key];
          const pct = peak <= 0 ? 0 : (n / peak) * 100;
          return (
            <Stack key={key} direction="row" spacing={1} alignItems="center">
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ width: 110, flexShrink: 0 }}
              >
                {GRADE_LABELS[rating]}
              </Typography>
              <Box
                sx={{
                  flex: 1,
                  height: 10,
                  borderRadius: 0.5,
                  bgcolor: "action.hover",
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    width: `${pct}%`,
                    height: "100%",
                    bgcolor: color,
                    minWidth: n > 0 ? 4 : 0,
                  }}
                />
              </Box>
              <Typography
                variant="caption"
                sx={{ width: 28, textAlign: "right", flexShrink: 0 }}
              >
                {n}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {total === 0
          ? "No grades in this window yet."
          : `${total} grades in the last 14 days`}
      </Typography>
    </Stack>
  );
}
