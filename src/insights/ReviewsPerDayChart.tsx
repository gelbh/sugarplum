import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { day: string; count: number };

type Props = {
  series: readonly Point[];
  reviewsDays?: number;
};

function shortDay(day: string): string {
  return day.length >= 10 ? day.slice(5) : day;
}

export default function ReviewsPerDayChart({
  series,
  reviewsDays,
}: Props) {
  const theme = useTheme();
  const total = series.reduce((sum, p) => sum + p.count, 0);
  const peak = series.reduce((m, p) => Math.max(m, p.count), 0);
  const aria =
    total === 0
      ? "No reviews in this window"
      : `${total} reviews over ${series.length} days, peak ${peak} in one day`;
  const data = series.map((p) => ({
    ...p,
    label: shortDay(p.day),
  }));
  const title =
    reviewsDays != null ? `Reviews per day (${reviewsDays}d)` : "Reviews per day";

  return (
    <Stack spacing={1}>
      <Typography
        variant="subtitle2"
        component="h2"
        sx={{ color: "primary.main", fontWeight: 600 }}
      >
        {title}
      </Typography>
      {total === 0 ? (
        <Box role="img" aria-label={aria}>
          <Typography variant="caption" color="text.secondary">
            No reviews in this window yet.
          </Typography>
        </Box>
      ) : (
        <>
          <Box role="img" aria-label={aria} sx={{ width: "100%", height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  width={28}
                  tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                />
                <Tooltip
                  formatter={(value) => [value ?? 0, "Reviews"]}
                  labelFormatter={(_, payload) => {
                    const day = payload?.[0]?.payload?.day;
                    return typeof day === "string" ? day : "";
                  }}
                />
                <Bar
                  dataKey="count"
                  fill={theme.palette.primary.main}
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {total} reviews · peak {peak}/day
          </Typography>
        </>
      )}
    </Stack>
  );
}
