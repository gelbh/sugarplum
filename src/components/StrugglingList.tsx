import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  asRegenType,
  regenCard,
  type StrugglingRow,
} from "../api/client";
import { isGuest } from "../guest/session";
import { GRADE_LABELS } from "../study/gradeLabels";

export function formatStrugglingCaption(row: {
  again_14d: number;
  hard_14d: number;
  lapses: number;
  retrievability?: number | null;
}): string {
  const parts = [
    `${GRADE_LABELS[1]} (14d): ${row.again_14d}`,
    `${GRADE_LABELS[2]} (14d): ${row.hard_14d}`,
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

export default function StrugglingList({
  rows,
  emptyMessage = "No struggling cards right now.",
}: StrugglingListProps) {
  const guest = isGuest();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [previewById, setPreviewById] = useState<Record<string, string>>({});

  async function onImprove(row: StrugglingRow) {
    const type = asRegenType(row.type);
    if (!type || guest) return;
    setBusyId(row.id);
    setErrorById((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
    try {
      const updated = await regenCard(row.id, { type });
      const front =
        typeof updated.front === "string" ? updated.front.trim() : "";
      if (front) {
        setPreviewById((prev) => ({ ...prev, [row.id]: front }));
      }
    } catch (err) {
      setErrorById((prev) => ({
        ...prev,
        [row.id]:
          err instanceof ApiError ? err.message : "Could not improve card",
      }));
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <Typography variant="body2" sx={{
        color: "text.secondary"
      }}>
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
      {rows.map((row) => {
        const regenType = asRegenType(row.type);
        const showImprove = !guest && regenType != null;
        const noSource = showImprove && !row.has_regen_source;
        const noSourceId = `struggling-no-source-${row.id}`;
        const busy = busyId === row.id;
        const error = errorById[row.id];
        return (
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
              sx={{
                alignItems: "flex-start",
                justifyContent: "space-between"
              }}>
              <Typography
                variant="body1"
                sx={{ fontWeight: 500, flex: 1, minWidth: 0 }}
              >
                {previewById[row.id] || row.front_preview || "(no preview)"}
              </Typography>
              <Chip
                size="small"
                label={row.is_due ? "Due" : "Not due"}
                color={row.is_due ? "warning" : "default"}
                variant={row.is_due ? "filled" : "outlined"}
              />
            </Stack>
            <Typography variant="caption" sx={{
              color: "text.secondary"
            }}>
              {formatStrugglingCaption(row)}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{
                alignItems: "center",
                flexWrap: "wrap"
              }}>
              {row.is_due ? (
                <Button
                  variant="contained"
                  size="small"
                  href={`/study?card=${encodeURIComponent(row.id)}`}
                  sx={{ fontWeight: 600 }}
                >
                  Study
                </Button>
              ) : (
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>
                  Due {formatStrugglingDue(row.due)}
                </Typography>
              )}
              {showImprove ? (
                <Button
                  variant="outlined"
                  size="small"
                  disabled={busy || noSource}
                  aria-describedby={noSource ? noSourceId : undefined}
                  onClick={() => void onImprove(row)}
                  sx={{ fontWeight: 600 }}
                >
                  {busy ? "Improving…" : "Improve"}
                </Button>
              ) : null}
            </Stack>
            {noSource ? (
              <Typography
                id={noSourceId}
                variant="caption"
                sx={{
                  color: "text.secondary"
                }}
              >
                No source material to improve from.
              </Typography>
            ) : null}
            {error ? (
              <Typography variant="caption" color="error">
                {error}
              </Typography>
            ) : null}
          </Box>
        );
      })}
    </Stack>
  );
}
