import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useChartColors } from "./chartColors";
import { insightsSectionTitleSx } from "./operatePaper";
import type {
  InsightsDifficultyMix,
  InsightsStabilitySnapshot,
} from "./types";

type Props = {
  difficulty: InsightsDifficultyMix;
  stability: InsightsStabilitySnapshot;
};

/** Calm difficulty ladder (not Anki traffic lights). */
const DIFFICULTY_COLORS = {
  easy: "rgba(91, 44, 111, 0.35)",
  medium: "rgba(91, 44, 111, 0.6)",
  hard: "#5B2C6F",
} as const;

const DIFFICULTY_SEGMENTS = [
  { key: "easy" as const, label: "Easy" },
  { key: "medium" as const, label: "Medium" },
  { key: "hard" as const, label: "Hard" },
];

export default function DifficultyStabilityBlock({
  difficulty,
  stability,
}: Props) {
  const colors = useChartColors();
  const hasDifficulty = difficulty.total > 0;
  const hasStability =
    stability.medianDays != null ||
    stability.bins.some((b) => b.count > 0);
  if (!hasDifficulty && !hasStability) {
    return (
      <Stack spacing={1} sx={{ mt: 2.5 }}>
        <Typography
          variant="subtitle1"
          component="h3"
          sx={{ ...insightsSectionTitleSx, mb: 0.75 }}
        >
          Difficulty and stability
        </Typography>
        <Typography variant="body2" color="text.secondary">
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
    <Stack spacing={1.5} sx={{ mt: 2.5 }} role="img" aria-label={ariaParts.join(". ")}>
      <Typography
        variant="subtitle1"
        component="h3"
        sx={{ ...insightsSectionTitleSx, mb: 0.75 }}
      >
        Difficulty and stability
      </Typography>

      {hasDifficulty ? (
        <Stack spacing={0.75}>
          <Box
            sx={{
              display: "flex",
              height: 12,
              borderRadius: 1,
              overflow: "hidden",
              bgcolor: "action.hover",
              width: "100%",
            }}
          >
            {DIFFICULTY_SEGMENTS.map(({ key }) => {
              const count = difficulty[key];
              if (count <= 0) return null;
              return (
                <Box
                  key={key}
                  sx={{
                    width: `${(100 * count) / difficulty.total}%`,
                    bgcolor: DIFFICULTY_COLORS[key],
                    minWidth: count > 0 ? 4 : 0,
                  }}
                />
              );
            })}
          </Box>
          <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
            {DIFFICULTY_SEGMENTS.map(({ key, label }) => (
              <Stack
                key={key}
                direction="row"
                spacing={0.75}
                alignItems="center"
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: 0.5,
                    bgcolor: DIFFICULTY_COLORS[key],
                    flexShrink: 0,
                  }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {label} {difficulty[key]}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>
      ) : null}

      <Typography variant="caption" color="text.secondary">
        {stability.medianDays == null
          ? "Median stability —"
          : `Median stability ${stability.medianDays}d`}
      </Typography>

      {stability.bins.some((b) => b.count > 0) ? (
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
          alignItems="flex-end"
          sx={{ minHeight: 40 }}
        >
          {stability.bins.map((bin) => (
            <Stack key={bin.label} spacing={0.25} alignItems="center" sx={{ minWidth: 40 }}>
              <Box
                aria-hidden
                sx={{
                  width: 28,
                  height: Math.max(4, Math.round((32 * bin.count) / maxBin)),
                  borderRadius: "3px 3px 0 0",
                  bgcolor: colors.primary,
                  opacity: bin.count === 0 ? 0.2 : 0.85,
                }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: 10, fontVariantNumeric: "tabular-nums" }}
              >
                {bin.label}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: 10, fontVariantNumeric: "tabular-nums" }}
              >
                {bin.count}
              </Typography>
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
