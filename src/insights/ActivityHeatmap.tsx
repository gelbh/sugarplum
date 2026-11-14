import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";

type Point = { day: string; count: number };

type Props = {
  series: readonly Point[];
};

const CELL = 11;
const GAP = 3;
const WEEKDAYS = 7;

/** Parse YYYY-MM-DD as UTC noon → weekday 0=Sun … 6=Sat (GitHub grid). */
function weekdaySun0(day: string): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

function intensityLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export default function ActivityHeatmap({ series }: Props) {
  const theme = useTheme();
  const total = series.reduce((sum, p) => sum + p.count, 0);
  const activeDays = series.filter((p) => p.count > 0).length;
  const peak = series.reduce((m, p) => Math.max(m, p.count), 0);
  const aria =
    total === 0
      ? "No review activity in this window"
      : `${activeDays} active days, ${total} reviews over ${series.length} days`;

  const emptyFill = alpha(theme.palette.text.primary, 0.08);
  const fills = [
    emptyFill,
    alpha(theme.palette.primary.main, 0.25),
    alpha(theme.palette.primary.main, 0.45),
    alpha(theme.palette.primary.main, 0.7),
    theme.palette.primary.main,
  ] as const;

  // Pad leading empty cells so column 0 starts on Sunday.
  const lead = series.length > 0 ? weekdaySun0(series[0]!.day) : 0;
  const cells: Array<{ day: string; count: number } | null> = [
    ...Array.from({ length: lead }, () => null),
    ...series.map((p) => ({ day: p.day, count: p.count })),
  ];
  const weekCount = Math.ceil(cells.length / WEEKDAYS) || 1;
  while (cells.length < weekCount * WEEKDAYS) cells.push(null);

  const width = weekCount * (CELL + GAP) - GAP;
  const height = WEEKDAYS * (CELL + GAP) - GAP;

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2" component="h2">
        Review activity
      </Typography>
      {total === 0 ? (
        <Box role="img" aria-label={aria}>
          <Typography variant="caption" color="text.secondary">
            No review activity in this window yet.
          </Typography>
        </Box>
      ) : (
        <>
          <Box
            role="img"
            aria-label={aria}
            sx={{ overflowX: "auto", maxWidth: "100%" }}
          >
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              aria-hidden
            >
              {cells.map((cell, i) => {
                const week = Math.floor(i / WEEKDAYS);
                const dow = i % WEEKDAYS;
                const x = week * (CELL + GAP);
                const y = dow * (CELL + GAP);
                const level = cell
                  ? intensityLevel(cell.count, peak)
                  : 0;
                const title = cell
                  ? `${cell.day}: ${cell.count} review${cell.count === 1 ? "" : "s"}`
                  : undefined;
                return (
                  <rect
                    key={cell?.day ?? `pad-${i}`}
                    x={x}
                    y={y}
                    width={CELL}
                    height={CELL}
                    rx={2}
                    ry={2}
                    fill={fills[level]}
                  >
                    {title ? <title>{title}</title> : null}
                  </rect>
                );
              })}
            </svg>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {activeDays} active days · {total} reviews in the last{" "}
            {series.length} days
            {peak > 0 ? ` · peak ${peak}` : ""}
          </Typography>
        </>
      )}
    </Stack>
  );
}
