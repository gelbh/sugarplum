import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useChartColors } from "./chartColors";
import MetricTip from "./MetricTip";
import { TIP_BY_SUBJECT, TIP_STABILITY } from "./metricTips";
import { DIFFICULTY_SEGMENTS, difficultySegmentColors } from "./difficultyColors";
import { insightsBrandSerif, insightsSectionTitleSx } from "./operatePaper";
import type { InsightsSubjectDifficultyStability } from "./types";

type Props = {
  rows: readonly InsightsSubjectDifficultyStability[];
};

export default function SubjectDifficultyStabilityList({ rows }: Props) {
  const colors = useChartColors();
  const difficultyColors = difficultySegmentColors(colors.scheme);
  if (rows.length === 0) return null;

  return (
    <Stack spacing={1.5} aria-label="Difficulty by subject">
      <Typography component="h3" sx={{ ...insightsSectionTitleSx, mb: 0 }}>
        <MetricTip title={TIP_BY_SUBJECT}>By subject</MetricTip>
      </Typography>
      <Stack spacing={1.25}>
        {rows.map((row) => {
          const key = row.subjectId ?? `unassigned:${row.title}`;
          const hasMix = row.difficulty.total > 0;
          return (
            <Box
              key={key}
              sx={{
                px: 1.5,
                py: 1.25,
                borderRadius: 1.5,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: colors.hover,
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                alignItems="baseline"
                justifyContent="space-between"
                useFlexGap
                flexWrap="wrap"
                sx={{ mb: hasMix ? 1 : 0 }}
              >
                <Typography
                  sx={{
                    fontFamily: insightsBrandSerif,
                    fontWeight: 400,
                    letterSpacing: "0.015em",
                    fontSize: "1.05rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: { xs: "62%", sm: "70%" },
                  }}
                >
                  {row.title}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  <MetricTip title={TIP_STABILITY}>
                    {row.medianStabilityDays == null
                      ? "Median —"
                      : `Median ${row.medianStabilityDays}d`}
                  </MetricTip>
                </Typography>
              </Stack>
              {hasMix ? (
                <Box
                  sx={{
                    display: "flex",
                    height: 10,
                    borderRadius: 1,
                    overflow: "hidden",
                    bgcolor:
                      colors.scheme === "dark"
                        ? "rgba(232, 216, 199, 0.08)"
                        : "rgba(30, 13, 27, 0.06)",
                    width: "100%",
                  }}
                  role="img"
                  aria-label={`Difficulty easy ${row.difficulty.easy}, medium ${row.difficulty.medium}, hard ${row.difficulty.hard}`}
                >
                  {DIFFICULTY_SEGMENTS.map(({ key: seg, label }) => {
                    const count = row.difficulty[seg];
                    if (count <= 0) return null;
                    return (
                      <Tooltip
                        key={seg}
                        title={`${label}: ${count}`}
                        enterDelay={200}
                      >
                        <Box
                          sx={{
                            width: `${(100 * count) / row.difficulty.total}%`,
                            bgcolor: difficultyColors[seg],
                            minWidth: 3,
                            height: "100%",
                            cursor: "default",
                          }}
                        />
                      </Tooltip>
                    );
                  })}
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}
