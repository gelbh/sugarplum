import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { gradeChartFill, GRADE_LABELS } from "../study/kernel";
import { useChartColors } from "./chartColors";
import MetricTip from "./MetricTip";
import {
  TIP_GRADE_BY_MATURITY,
  TIP_STAGE_LEARNING,
  TIP_STAGE_MATURE,
  TIP_STAGE_YOUNG,
} from "./metricTips";
import { insightsBrandSerif, insightsSectionTitleSx } from "./operatePaper";
import type { InsightsGradeByMaturity, InsightsGradeCounts } from "./types";

type Props = {
  byMaturity: InsightsGradeByMaturity;
  gradeDays?: number;
};

/** Learning → Young → Mature: stage order, left to right. */
const GROUPS: Array<{
  key: keyof InsightsGradeByMaturity;
  label: string;
  tip: string;
}> = [
  { key: "learning", label: "Learning", tip: TIP_STAGE_LEARNING },
  { key: "young", label: "Young", tip: TIP_STAGE_YOUNG },
  { key: "mature", label: "Mature", tip: TIP_STAGE_MATURE },
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
  const colors = useChartColors();
  const total =
    groupTotal(byMaturity.young) +
    groupTotal(byMaturity.mature) +
    groupTotal(byMaturity.learning);
  const aria =
    total === 0
      ? "No maturity-split grades in this window"
      : `Grade mix by maturity: Learning ${groupTotal(byMaturity.learning)}, Young ${groupTotal(byMaturity.young)}, Mature ${groupTotal(byMaturity.mature)}`;
  const maxGroup = Math.max(
    1,
    ...GROUPS.map(({ key }) => groupTotal(byMaturity[key])),
  );
  const gradeTotals = GRADES.map(({ key, rating }) => ({
    key,
    rating,
    count:
      byMaturity.learning[key] +
      byMaturity.young[key] +
      byMaturity.mature[key],
  }));

  return (
    <Stack spacing={1.75}>
      <Typography component="h3" sx={{ ...insightsSectionTitleSx, mb: 0 }}>
        <MetricTip title={TIP_GRADE_BY_MATURITY}>
          Grade mix by maturity ({gradeDays}d)
        </MetricTip>
      </Typography>
      {total === 0 ? (
        <Box role="img" aria-label={aria}>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            No young, mature, or learning grades in this window yet.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.75}>
          <Stack
            role="img"
            aria-label={aria}
            direction="row"
            spacing={{ xs: 1.5, sm: 2.5 }}
            sx={{
              alignItems: "flex-end",
              justifyContent: "space-between",
              px: { sm: 1 },
              minHeight: 148
            }}>
            {GROUPS.map(({ key, label, tip }) => {
              const counts = byMaturity[key];
              const groupSum = groupTotal(counts);
              const colH = Math.max(
                28,
                Math.round((112 * groupSum) / maxGroup),
              );
              const detail = GRADES.map(
                ({ key: gradeKey, rating }) =>
                  `${GRADE_LABELS[rating]} ${counts[gradeKey]}`,
              ).join(" · ");
              return (
                <Stack
                  key={key}
                  spacing={0.75}
                  sx={{
                    alignItems: "center",
                    flex: 1,
                    minWidth: 0
                  }}>
                  <Typography
                    component="span"
                    sx={{
                      fontFamily: insightsBrandSerif,
                      fontSize: "1.05rem",
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                      color: "text.primary",
                    }}
                  >
                    {groupSum}
                  </Typography>
                  <Tooltip
                    title={`${label}: ${groupSum} grades · ${detail}`}
                    enterDelay={200}
                  >
                    <Box
                      sx={{
                        width: "100%",
                        maxWidth: 72,
                        height: colH,
                        borderRadius: "6px 6px 2px 2px",
                        bgcolor: colors.hover,
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column-reverse",
                        cursor: "default",
                      }}
                    >
                      {GRADES.map(({ key: gradeKey, rating }) => {
                        const count = counts[gradeKey];
                        if (count <= 0 || groupSum === 0) return null;
                        return (
                          <Box
                            key={gradeKey}
                            sx={{
                              height: `${(100 * count) / groupSum}%`,
                              bgcolor: gradeChartFill(rating),
                              minHeight: count > 0 ? 3 : 0,
                            }}
                          />
                        );
                      })}
                    </Box>
                  </Tooltip>
                  <Typography
                    variant="caption"
                    title={tip}
                    sx={{
                      color: "text.secondary",
                      textAlign: "center",
                      lineHeight: 1.2
                    }}>
                    {label}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>

          <Stack
            direction="row"
            spacing={2.25}
            useFlexGap
            sx={{
              flexWrap: "wrap",
              alignItems: "baseline"
            }}>
            {gradeTotals.map(({ key, rating, count }) => (
              <Tooltip
                key={key}
                title={`${GRADE_LABELS[rating]}: ${count} across all stages`}
                enterDelay={200}
              >
                <Stack
                  direction="row"
                  spacing={0.75}
                  sx={{
                    alignItems: "baseline",
                    cursor: "default"
                  }}>
                  <Box
                    aria-hidden
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: 0.5,
                      bgcolor: gradeChartFill(rating),
                      flexShrink: 0,
                      alignSelf: "center",
                    }}
                  />
                  <Typography
                    component="span"
                    sx={{
                      fontFamily: insightsBrandSerif,
                      fontSize: "1.05rem",
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                      color: "text.primary",
                    }}
                  >
                    {count}
                  </Typography>
                  <Typography variant="caption" sx={{
                    color: "text.secondary"
                  }}>
                    {GRADE_LABELS[rating]}
                  </Typography>
                </Stack>
              </Tooltip>
            ))}
          </Stack>

          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            Split across maturity for the last {gradeDays} days
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
