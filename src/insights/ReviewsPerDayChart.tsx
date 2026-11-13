import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type Point = { day: string; count: number };

type Props = {
  series: readonly Point[];
};

export default function ReviewsPerDayChart({ series }: Props) {
  const total = series.reduce((sum, p) => sum + p.count, 0);
  const peak = series.reduce((m, p) => Math.max(m, p.count), 0);
  const aria =
    total === 0
      ? "No reviews in this window"
      : `${total} reviews over ${series.length} days, peak ${peak} in one day`;

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2" component="h2">
        Reviews per day
      </Typography>
      <Box
        role="img"
        aria-label={aria}
        sx={{
          display: "flex",
          alignItems: "flex-end",
          gap: 0.25,
          height: 96,
          width: "100%",
          px: 0.5,
          bgcolor: "action.hover",
          borderRadius: 1,
        }}
      >
        {series.map((p) => {
          const h = peak <= 0 ? 0 : Math.max(p.count > 0 ? 4 : 0, (p.count / peak) * 88);
          return (
            <Box
              key={p.day}
              sx={{
                flex: 1,
                minWidth: 2,
                height: h || 2,
                bgcolor: p.count > 0 ? "primary.main" : "action.disabledBackground",
                borderRadius: "2px 2px 0 0",
                alignSelf: "flex-end",
              }}
            />
          );
        })}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {total === 0
          ? "No reviews in this window yet."
          : `${total} reviews · peak ${peak}/day`}
      </Typography>
    </Stack>
  );
}
