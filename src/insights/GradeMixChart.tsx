import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { gradeChartFill } from "../study/gradeColors";
import { GRADE_LABELS } from "../study/gradeLabels";
import { useChartColors } from "./chartColors";
import MetricTip from "./MetricTip";
import { TIP_GRADE_MIX, TIP_GRADE_PASS } from "./metricTips";
import { insightsBrandSerif, insightsSectionTitleSx } from "./operatePaper";
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
  const colors = useChartColors();
  const total = counts.again + counts.hard + counts.good + counts.easy;
  const passedPct =
    total === 0
      ? null
      : Math.round((100 * (counts.good + counts.easy)) / total);
  const aria =
    total === 0
      ? "No grades in this window"
      : `Grade mix: ${GRADE_LABELS[1]} ${counts.again}, ${GRADE_LABELS[2]} ${counts.hard}, ${GRADE_LABELS[3]} ${counts.good}, ${GRADE_LABELS[4]} ${counts.easy}`;
  const maxCount = Math.max(1, ...ROWS.map(({ key }) => counts[key]));

  return (
    <Stack spacing={1.75}>
      <Typography
        variant="subtitle1"
        component="h2"
        sx={{ ...insightsSectionTitleSx, mb: 0 }}
      >
        <MetricTip title={TIP_GRADE_MIX}>Grade mix ({gradeDays}d)</MetricTip>
      </Typography>
      {total === 0 ? (
        <Box role="img" aria-label={aria}>
          <Typography variant="body2" color="text.secondary">
            No grades in this window yet. Grade cards in Study to see the mix.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.75}>
          <Stack spacing={1.15} role="img" aria-label={aria}>
            {ROWS.map(({ key, rating }) => {
              const count = counts[key];
              const fill = gradeChartFill(rating);
              const share =
                total === 0 ? 0 : Math.round((100 * count) / total);
              return (
                <Tooltip
                  key={key}
                  title={`${GRADE_LABELS[rating]}: ${count} (${share}% of grades)`}
                  enterDelay={200}
                >
                  <Stack
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    sx={{ cursor: "default" }}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        width: { xs: 108, sm: 120 },
                        flexShrink: 0,
                        lineHeight: 1.2,
                      }}
                    >
                      {GRADE_LABELS[rating]}
                    </Typography>
                    <Box
                      sx={{
                        flex: 1,
                        height: 12,
                        borderRadius: 1.5,
                        bgcolor: colors.hover,
                        overflow: "hidden",
                        minWidth: 0,
                      }}
                    >
                      <Box
                        sx={{
                          width: `${(100 * count) / maxCount}%`,
                          height: "100%",
                          bgcolor: fill,
                          borderRadius: 1.5,
                          minWidth: count > 0 ? 4 : 0,
                          opacity: count === 0 ? 0.28 : 1,
                        }}
                      />
                    </Box>
                    <Typography
                      component="span"
                      sx={{
                        fontFamily: insightsBrandSerif,
                        fontSize: "1.05rem",
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
                        color: "text.primary",
                        width: 28,
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      {count}
                    </Typography>
                  </Stack>
                </Tooltip>
              );
            })}
          </Stack>

          <Typography variant="body2" color="text.secondary">
            <Box
              component="span"
              sx={{
                fontFamily: insightsBrandSerif,
                color: "primary.main",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {total}
            </Box>{" "}
            grades in the last {gradeDays} days
            {passedPct == null ? null : (
              <>
                {" · "}
                <Box
                  component="span"
                  sx={{
                    fontFamily: insightsBrandSerif,
                    color: "warning.main",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {passedPct}%
                </Box>{" "}
                <MetricTip title={TIP_GRADE_PASS}>
                  Good Enough or easier
                </MetricTip>
              </>
            )}
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
