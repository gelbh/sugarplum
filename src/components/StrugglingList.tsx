import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { StrugglingRow } from "../api/client";
import { formatStrugglingCaption } from "../study/strugglingCaption";

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
    <Stack spacing={1.25} sx={{ width: "100%", textAlign: "left" }}>
      {rows.map((row) => (
        <Paper
          key={row.id}
          variant="outlined"
          sx={{
            p: 1.5,
            borderRadius: 1.5,
            bgcolor: "background.paper",
          }}
        >
          <Stack spacing={1}>
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
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
