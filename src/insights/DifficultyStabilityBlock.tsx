import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useChartColors } from "./chartColors";
import MetricTip from "./MetricTip";
import {
  TIP_DIFFICULTY_EASY,
  TIP_DIFFICULTY_HARD,
  TIP_DIFFICULTY_MEDIUM,
  TIP_DIFFICULTY_STABILITY,
  TIP_STABILITY,
  TIP_STABILITY_BINS,
} from "./metricTips";
import { DIFFICULTY_SEGMENTS, difficultySegmentColors } from "./difficultyColors";
import { insightsBrandSerif, insightsSectionTitleSx } from "./operatePaper";
import type {
  InsightsDifficultyMix,
  InsightsStabilitySnapshot,
} from "./types";

const DIFFICULTY_TIPS = {
  easy: TIP_DIFFICULTY_EASY,
  medium: TIP_DIFFICULTY_MEDIUM,
  hard: TIP_DIFFICULTY_HARD,
} as const;

type Props = {
  difficulty: InsightsDifficultyMix;
  stability: InsightsStabilitySnapshot;
};

export default function DifficultyStabilityBlock({
  difficulty,
  stability,
}: Props) {
  const colors = useChartColors();
  const difficultyColors = difficultySegmentColors(colors.scheme);
  const hasDifficulty = difficulty.total > 0;
  const hasStability =
    stability.medianDays != null || stability.bins.some((b) => b.count > 0);
  if (!hasDifficulty && !hasStability) {
    return (
      <Stack spacing={1}>
        <Typography component="h3" sx={{ ...insightsSectionTitleSx, mb: 0 }}>
          <MetricTip title={TIP_DIFFICULTY_STABILITY}>
            Difficulty and stability
          </MetricTip>
        </Typography>
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          Grade accepted cards to see FSRS difficulty and stability here.
        </Typography>
      </Stack>
    );
  }

  const maxBin = Math.max(1, ...stability.bins.map((b) => b.count));
  const ariaParts: string[] = [];
  if (hasDifficulty) {
    ariaParts.push(
      `Difficulty easy ${difficulty.easy}, medium ${difficulty.medium}, hard ${difficulty.hard}`,
    );
  }
  if (stability.medianDays != null) {
    ariaParts.push(`Median stability ${stability.medianDays} days`);
  }

  return (
    <Stack spacing={2}>
      <Typography component="h3" sx={{ ...insightsSectionTitleSx, mb: 0 }}>
        <MetricTip title={TIP_DIFFICULTY_STABILITY}>
          Difficulty and stability
        </MetricTip>
      </Typography>

      {hasDifficulty ? (
        <Stack spacing={1}>
          <Box
            role="img"
            aria-label={ariaParts[0] ?? "Difficulty mix"}
            sx={{
              display: "flex",
              height: 14,
              borderRadius: 1.5,
              overflow: "hidden",
              bgcolor: colors.hover,
              width: "100%",
            }}
          >
            {DIFFICULTY_SEGMENTS.map(({ key, label }) => {
              const count = difficulty[key];
              if (count <= 0) return null;
              const share = Math.round((100 * count) / difficulty.total);
              return (
                <Tooltip
                  key={key}
                  title={`${label}: ${count} (${share}%)`}
                  enterDelay={200}
                >
                  <Box
                    sx={{
                      width: `${(100 * count) / difficulty.total}%`,
                      bgcolor: difficultyColors[key],
                      minWidth: count > 0 ? 4 : 0,
                      height: "100%",
                      cursor: "default",
                    }}
                  />
                </Tooltip>
              );
            })}
          </Box>
          <Stack direction="row" spacing={2.25} useFlexGap sx={{
            flexWrap: "wrap"
          }}>
            {DIFFICULTY_SEGMENTS.map(({ key, label }) => (
              <Stack
                key={key}
                direction="row"
                spacing={0.75}
                sx={{
                  alignItems: "baseline"
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: 0.5,
                    bgcolor: difficultyColors[key],
                    flexShrink: 0,
                    alignSelf: "center",
                  }}
                />
                <Typography
                  component="span"
                  sx={{
                    fontFamily: insightsBrandSerif,
                    fontSize: "1.05rem",
                    color: "text.primary",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1,
                  }}
                >
                  {difficulty[key]}
                </Typography>
                <Typography variant="caption" sx={{
                  color: "text.secondary"
                }}>
                  <MetricTip title={DIFFICULTY_TIPS[key]}>{label}</MetricTip>
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>
      ) : null}

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={{ xs: 1.75, sm: 3 }}
        sx={{
          alignItems: { sm: "flex-end" },
          justifyContent: "space-between"
        }}>
        <Box>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 0.35
            }}>
            <MetricTip title={TIP_STABILITY}>Median stability</MetricTip>
          </Typography>
          <Typography
            component="p"
            sx={{
              fontFamily: insightsBrandSerif,
              fontSize: "1.75rem",
              lineHeight: 1,
              letterSpacing: "0.01em",
              color: "primary.main",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {stability.medianDays == null ? "—" : `${stability.medianDays}d`}
          </Typography>
        </Box>

        {stability.bins.some((b) => b.count > 0) ? (
          <Stack
            role="img"
            aria-label={
              ariaParts.find((p) => p.startsWith("Median")) ??
              TIP_STABILITY_BINS
            }
            direction="row"
            spacing={1.25}
            useFlexGap
            sx={{
              flexWrap: "nowrap",
              alignItems: "flex-end",
              minHeight: 56,
              pb: 0.25
            }}>
            {stability.bins.map((bin) => (
              <Tooltip
                key={bin.label}
                title={`${bin.label}: ${bin.count} cards. ${TIP_STABILITY_BINS}`}
                enterDelay={200}
              >
                <Stack
                  spacing={0.4}
                  sx={{
                    alignItems: "center",
                    minWidth: 44,
                    cursor: "default"
                  }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1
                    }}>
                    {bin.count}
                  </Typography>
                  <Box
                    aria-hidden
                    sx={{
                      width: 32,
                      height: Math.max(6, Math.round((44 * bin.count) / maxBin)),
                      borderRadius: "4px 4px 1px 1px",
                      bgcolor: colors.primary,
                      opacity: bin.count === 0 ? 0.22 : 0.9,
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontSize: "0.68rem",
                      fontVariantNumeric: "tabular-nums"
                    }}>
                    {bin.label}
                  </Typography>
                </Stack>
              </Tooltip>
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  );
}
