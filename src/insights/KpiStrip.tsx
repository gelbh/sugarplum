import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { InsightsSummary } from "./types";

type Props = {
  summary: InsightsSummary;
};

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <Stack
      spacing={0.25}
      sx={{
        minWidth: 88,
        px: 1.5,
        py: 1,
        borderRadius: 1,
        bgcolor: "action.hover",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
        {value}
      </Typography>
    </Stack>
  );
}

export default function KpiStrip({ summary }: Props) {
  const { kpis, gamification } = summary;
  const recall =
    kpis.avgRetrievability == null
      ? null
      : `${Math.round(100 * kpis.avgRetrievability)}%`;

  return (
    <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
      {gamification ? (
        <>
          <Chip label="Streak" value={String(gamification.streakCurrent)} />
          <Chip
            label="Level"
            value={`L${gamification.level} · ${gamification.xpTotal} XP`}
          />
        </>
      ) : null}
      <Chip
        label={`Reviews (${summary.window.reviewsDays}d)`}
        value={String(kpis.reviewsInWindow)}
      />
      <Chip label="Today" value={String(kpis.reviewedToday)} />
      {recall ? <Chip label="Est. recall" value={recall} /> : null}
      {kpis.composition.total > 0 ? (
        <Chip
          label="Mature"
          value={`${kpis.composition.mature} / ${kpis.composition.total}`}
        />
      ) : null}
    </Stack>
  );
}
