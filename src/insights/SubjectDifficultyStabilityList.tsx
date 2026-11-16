import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { InsightsSubjectDifficultyStability } from "./types";

type Props = {
  rows: readonly InsightsSubjectDifficultyStability[];
};

const DIFFICULTY_COLORS = {
  easy: "rgba(91, 44, 111, 0.35)",
  medium: "rgba(91, 44, 111, 0.6)",
  hard: "#5B2C6F",
} as const;

const DIFFICULTY_SEGMENTS = [
  { key: "easy" as const },
  { key: "medium" as const },
  { key: "hard" as const },
];

export default function SubjectDifficultyStabilityList({ rows }: Props) {
  if (rows.length === 0) return null;

  return (
    <Stack spacing={1.25} sx={{ mt: 2 }} aria-label="Difficulty by subject">
      <Typography variant="caption" color="text.secondary">
        By subject
      </Typography>
      {rows.map((row) => {
        const key = row.subjectId ?? `unassigned:${row.title}`;
        const hasMix = row.difficulty.total > 0;
        return (
          <Stack key={key} spacing={0.5}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="baseline"
              justifyContent="space-between"
              useFlexGap
              flexWrap="wrap"
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "70%",
                }}
              >
                {row.title}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {row.medianStabilityDays == null
                  ? "Median —"
                  : `Median ${row.medianStabilityDays}d`}
              </Typography>
            </Stack>
            {hasMix ? (
              <Box
                sx={{
                  display: "flex",
                  height: 8,
                  borderRadius: 1,
                  overflow: "hidden",
                  bgcolor: "action.hover",
                  width: "100%",
                }}
                role="img"
                aria-label={`Difficulty easy ${row.difficulty.easy}, medium ${row.difficulty.medium}, hard ${row.difficulty.hard}`}
              >
                {DIFFICULTY_SEGMENTS.map(({ key: seg }) => {
                  const count = row.difficulty[seg];
                  if (count <= 0) return null;
                  return (
                    <Box
                      key={seg}
                      sx={{
                        width: `${(100 * count) / row.difficulty.total}%`,
                        bgcolor: DIFFICULTY_COLORS[seg],
                        minWidth: 3,
                      }}
                    />
                  );
                })}
              </Box>
            ) : null}
          </Stack>
        );
      })}
    </Stack>
  );
}
