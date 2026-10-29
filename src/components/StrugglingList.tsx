import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { StrugglingRow } from "../api/client";

/** Caption bits for Insights / Today struggling rows. */
export function formatStrugglingCaption(row: {
  again_14d: number;
  hard_14d: number;
  lapses: number;
  retrievability?: number | null;
}): string {
  const parts = [
    `Again (14d): ${row.again_14d}`,
    `Hard (14d): ${row.hard_14d}`,
    `Lapses: ${row.lapses}`,
  ];
  const r = row.retrievability;
  if (typeof r === "number" && Number.isFinite(r)) {
    parts.push(`R: ${Math.round(Math.min(1, Math.max(0, r)) * 100)}%`);
  }
  return parts.join(" · ");
}

export function formatStrugglingDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type StrugglingListProps = {
  rows: StrugglingRow[];
  emptyMessage?: string;
};

/** Ranked struggling rows; Study CTA only when is_due (deep-links ?card=). */
export default function StrugglingList({
  rows,
  emptyMessage = "No struggling cards right now.",
}: StrugglingListProps) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {emptyMessage}
      </Typography>
    );
  }

  return (
    <Stack
      component="ul"
      spacing={0}
      divider={<Divider flexItem />}
      sx={{ m: 0, p: 0, listStyle: "none", width: "100%", textAlign: "left" }}
    >
      {rows.map((row) => (
        <Box
          component="li"
          key={row.id}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            py: 1,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            alignItems="flex-start"
            justifyContent="space-between"
          >
            <Typography
              variant="body1"
              sx={{ fontWeight: 500, flex: 1, minWidth: 0 }}
            >
              {row.front_preview || "(no preview)"}
            </Typography>
            <Chip
              size="small"
              label={row.is_due ? "Due" : "Not due"}
              color={row.is_due ? "warning" : "default"}
              variant={row.is_due ? "filled" : "outlined"}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {formatStrugglingCaption(row)}
          </Typography>
          {row.is_due ? (
            <Button
              variant="contained"
              size="small"
              href={`/study?card=${encodeURIComponent(row.id)}`}
              sx={{ alignSelf: "flex-start", fontWeight: 600 }}
            >
              Study
            </Button>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Due {formatStrugglingDue(row.due)}
            </Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
}
