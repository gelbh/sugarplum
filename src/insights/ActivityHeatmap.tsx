import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { heatmapFills, useChartColors } from "./chartColors";
import InsightsAliceStat from "./InsightsAliceStat";
import MetricTip from "./MetricTip";
import {
  TIP_CONSISTENCY,
  TIP_DAILY_LOAD,
  TIP_DAYS_STUDIED,
  TIP_REVIEW_ACTIVITY,
} from "./metricTips";
import { insightsBrandSerif, insightsSectionTitleSx } from "./operatePaper";

type Point = { day: string; count: number };

type Props = {
  series: readonly Point[];
  consistencyActiveDays?: number;
  consistencyWindowDays?: number;
  consistencyPct?: number | null;
  dailyLoad?: number | null;
};

const CELL = 13;
const GAP = 3;
const WEEKDAYS = 7;
const LABEL_W = 18;
/** Sun-start columns; show Mon / Wed / Fri labels (rows 1, 3, 5). */
const DOW_LABELS: Array<{ dow: number; text: string }> = [
  { dow: 1, text: "M" },
  { dow: 3, text: "W" },
  { dow: 5, text: "F" },
];

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

export default function ActivityHeatmap({
  series,
  consistencyActiveDays,
  consistencyWindowDays,
  consistencyPct,
  dailyLoad,
}: Props) {
  const theme = useTheme();
  const colors = useChartColors();
  const fills = heatmapFills(colors.scheme);
  const total = series.reduce((sum, p) => sum + p.count, 0);
  const activeDays = series.filter((p) => p.count > 0).length;
  const peak = series.reduce((m, p) => Math.max(m, p.count), 0);
  const aria =
    total === 0
      ? "No review activity in this window"
      : `${activeDays} active days, ${total} reviews over ${series.length} days`;

  // Pad leading empty cells so column 0 starts on Sunday.
  const lead = series.length > 0 ? weekdaySun0(series[0]!.day) : 0;
  const cells: Array<{ day: string; count: number } | null> = [
    ...Array.from({ length: lead }, () => null),
    ...series.map((p) => ({ day: p.day, count: p.count })),
  ];
  const weekCount = Math.ceil(cells.length / WEEKDAYS) || 1;
  while (cells.length < weekCount * WEEKDAYS) cells.push(null);

  const gridW = weekCount * (CELL + GAP) - GAP;
  const gridH = WEEKDAYS * (CELL + GAP) - GAP;
  const width = LABEL_W + gridW;
  const height = gridH;
  const studiedDays = consistencyActiveDays ?? activeDays;
  const windowDays = consistencyWindowDays;

  return (
    <Stack spacing={1.75}>
      <Typography component="h2" sx={{ ...insightsSectionTitleSx, mb: 0 }}>
        <MetricTip title={TIP_REVIEW_ACTIVITY}>Review activity</MetricTip>
      </Typography>

      {total === 0 ? (
        <Box role="img" aria-label={aria}>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            No review activity in this window yet.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.75}>
          <Stack direction="row" spacing={2.5} useFlexGap sx={{
            flexWrap: "wrap"
          }}>
            <InsightsAliceStat
              value={
                windowDays != null
                  ? `${studiedDays}/${windowDays}`
                  : studiedDays
              }
              label="days studied"
              tip={TIP_DAYS_STUDIED}
            />
            {consistencyPct != null ? (
              <InsightsAliceStat
                value={`${consistencyPct}%`}
                label="consistency"
                tip={TIP_CONSISTENCY}
                accent="warning"
              />
            ) : null}
            {dailyLoad != null ? (
              <InsightsAliceStat
                value={`~${dailyLoad}`}
                label="cards / day"
                tip={TIP_DAILY_LOAD}
              />
            ) : null}
          </Stack>

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
              {DOW_LABELS.map(({ dow, text }) => (
                <text
                  key={text}
                  x={0}
                  y={dow * (CELL + GAP) + CELL * 0.78}
                  fill={colors.textSecondary}
                  fontSize={9}
                  fontFamily={theme.typography.fontFamily}
                >
                  {text}
                </text>
              ))}
              {cells.map((cell, i) => {
                const week = Math.floor(i / WEEKDAYS);
                const dow = i % WEEKDAYS;
                const x = LABEL_W + week * (CELL + GAP);
                const y = dow * (CELL + GAP);
                const level = cell ? intensityLevel(cell.count, peak) : 0;
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
                    rx={2.5}
                    ry={2.5}
                    fill={fills[level]}
                  >
                    {title ? <title>{title}</title> : null}
                  </rect>
                );
              })}
            </svg>
          </Box>

          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{
              alignItems: "center",
              flexWrap: "wrap"
            }}>
            <Typography variant="caption" sx={{
              color: "text.secondary"
            }}>
              Less
            </Typography>
            {fills.map((fill, i) => (
              <Box
                key={i}
                aria-hidden
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: 0.5,
                  bgcolor: fill,
                }}
              />
            ))}
            <Typography variant="caption" sx={{
              color: "text.secondary"
            }}>
              More
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                ml: { xs: 0, sm: 0.5 }
              }}>
              <Box
                component="span"
                sx={{
                  fontFamily: insightsBrandSerif,
                  color: "text.primary",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {total}
              </Box>{" "}
              reviews
              {peak > 0 ? (
                <>
                  {" · peak "}
                  <Box
                    component="span"
                    sx={{
                      fontFamily: insightsBrandSerif,
                      color: "text.primary",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {peak}
                  </Box>
                </>
              ) : null}
            </Typography>
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
