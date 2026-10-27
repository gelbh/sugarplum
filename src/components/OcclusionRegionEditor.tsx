import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useCallback, useRef, useState, type PointerEvent } from "react";
import { mediaUrl, type OcclusionFrontView } from "../api/client";

export type OcclusionRegion = OcclusionFrontView["regions"][number];

export type OcclusionRegionEditorProps = {
  front: OcclusionFrontView;
  disabled?: boolean;
  onChange: (next: { front: OcclusionFrontView; back: { answer: string } }) => void;
};

type DragKind = "move" | "resize";

type DragState = {
  kind: DragKind;
  regionId: string;
  startX: number;
  startY: number;
  origin: OcclusionRegion;
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function clampRegion(r: OcclusionRegion): OcclusionRegion {
  const w = Math.min(Math.max(r.w, 0.02), 1);
  const h = Math.min(Math.max(r.h, 0.02), 1);
  const x = clamp01(Math.min(r.x, 1 - w));
  const y = clamp01(Math.min(r.y, 1 - h));
  return { ...r, x, y, w, h };
}

function answerFromRegions(
  regions: OcclusionRegion[],
  selectedId: string | null,
): string {
  const selected =
    regions.find((r) => r.id === selectedId) ?? regions[0] ?? null;
  return selected?.label.trim() || selected?.id || "region";
}

/** Image + overlay region boxes (drag/resize); study reveal uses region labels. */
export default function OcclusionRegionEditor({
  front,
  disabled = false,
  onChange,
}: OcclusionRegionEditorProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    front.regions[0]?.id ?? null,
  );

  const emit = useCallback(
    (nextFront: OcclusionFrontView, nextSelectedId: string | null) => {
      onChange({
        front: nextFront,
        back: { answer: answerFromRegions(nextFront.regions, nextSelectedId) },
      });
    },
    [onChange],
  );

  const updateRegion = useCallback(
    (id: string, patch: Partial<OcclusionRegion>) => {
      const regions = front.regions.map((r) =>
        r.id === id ? clampRegion({ ...r, ...patch }) : r,
      );
      emit({ ...front, regions }, selectedId);
    },
    [emit, front, selectedId],
  );

  function removeRegion(id: string) {
    if (disabled || front.regions.length <= 1) return;
    const regions = front.regions.filter((r) => r.id !== id);
    const nextSelected =
      selectedId === id ? (regions[0]?.id ?? null) : selectedId;
    setSelectedId(nextSelected);
    emit({ ...front, regions }, nextSelected);
  }

  function onBoxPointerDown(
    e: PointerEvent<HTMLDivElement>,
    region: OcclusionRegion,
    kind: DragKind,
  ) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(region.id);
    setDrag({
      kind,
      regionId: region.id,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...region },
    });
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag || disabled) return;
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - drag.startX) / (rect.width || 1);
    const dy = (e.clientY - drag.startY) / (rect.height || 1);
    const o = drag.origin;
    if (drag.kind === "move") {
      updateRegion(drag.regionId, { x: o.x + dx, y: o.y + dy });
    } else {
      updateRegion(drag.regionId, { w: o.w + dx, h: o.h + dy });
    }
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    setDrag(null);
  }

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          maxHeight: "45vh",
          overflow: "auto",
          borderRadius: "6px",
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          ref={stageRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          sx={{
            position: "relative",
            width: "100%",
            lineHeight: 0,
            userSelect: "none",
            touchAction: "none",
          }}
        >
          <Box
            component="img"
            src={mediaUrl(front.image_key)}
            alt="Occlusion draft"
            draggable={false}
            sx={{
              display: "block",
              width: "100%",
              height: "auto",
              pointerEvents: "none",
            }}
          />
          {front.regions.map((region) => {
            const selected = region.id === selectedId;
            return (
              <Box
                key={region.id}
                onPointerDown={(e) => onBoxPointerDown(e, region, "move")}
                sx={{
                  position: "absolute",
                  left: `${region.x * 100}%`,
                  top: `${region.y * 100}%`,
                  width: `${region.w * 100}%`,
                  height: `${region.h * 100}%`,
                  boxSizing: "border-box",
                  border: "2px solid",
                  borderColor: selected ? "primary.main" : "secondary.main",
                  bgcolor: selected
                    ? "color-mix(in srgb, var(--sp-plum) 28%, transparent)"
                    : "color-mix(in srgb, var(--sp-lamp-glow) 65%, transparent)",
                  cursor: disabled ? "default" : "move",
                  borderRadius: "4px",
                  boxShadow: selected
                    ? "0 2px 10px color-mix(in srgb, var(--sp-plum) 28%, transparent)"
                    : "none",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    position: "absolute",
                    left: 4,
                    top: 2,
                    px: 0.5,
                    bgcolor: "var(--sp-stage-bg)",
                    color: "var(--sp-ivory)",
                    borderRadius: "4px",
                    maxWidth: "95%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    lineHeight: 1.4,
                    pointerEvents: "none",
                    fontFamily:
                      '"Source Sans 3", "Helvetica", "Arial", sans-serif',
                    fontSize: "0.6875rem",
                    letterSpacing: "0.02em",
                  }}
                >
                  {region.label || region.id}
                </Typography>
                {!disabled ? (
                  <Box
                    onPointerDown={(e) => onBoxPointerDown(e, region, "resize")}
                    aria-label="Resize region"
                    sx={{
                      position: "absolute",
                      right: -5,
                      bottom: -5,
                      width: 12,
                      height: 12,
                      bgcolor: "primary.main",
                      borderRadius: "2px",
                      cursor: "nwse-resize",
                      border: "1px solid",
                      borderColor: "background.paper",
                    }}
                  />
                ) : null}
              </Box>
            );
          })}
        </Box>
      </Box>

      <TextField
        label="Prompt (optional)"
        value={front.prompt ?? ""}
        onChange={(e) => {
          const prompt = e.target.value;
          emit(
            {
              ...front,
              prompt: prompt.length > 0 ? prompt : undefined,
            },
            selectedId,
          );
        }}
        fullWidth
        size="small"
        disabled={disabled}
      />

      <Typography variant="body2" color="text.secondary">
        Study reveals the hidden region’s label (one region per card via hide_one).
        Delete unused boxes before accept.
      </Typography>

      <Stack spacing={1.5}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Regions
        </Typography>
        {front.regions.map((region) => (
          <Stack
            key={region.id}
            spacing={1}
            sx={{
              p: 1.5,
              border: "1px solid",
              borderColor:
                region.id === selectedId ? "primary.main" : "divider",
              borderRadius: "6px",
              bgcolor: "background.paper",
              boxShadow:
                region.id === selectedId
                  ? "0 0 0 1px color-mix(in srgb, var(--sp-plum) 20%, transparent)"
                  : "none",
            }}
            onClick={() => {
              setSelectedId(region.id);
              emit(front, region.id);
            }}
          >
            <TextField
              label={`Label (${region.id})`}
              value={region.label}
              onChange={(e) => updateRegion(region.id, { label: e.target.value })}
              size="small"
              fullWidth
              disabled={disabled}
              helperText={
                region.id === selectedId
                  ? "This label is the study answer for hide_one"
                  : undefined
              }
            />
            <Stack direction="row" spacing={1}>
              {(
                [
                  ["x", region.x],
                  ["y", region.y],
                  ["w", region.w],
                  ["h", region.h],
                ] as const
              ).map(([key, value]) => (
                <TextField
                  key={key}
                  label={key}
                  type="number"
                  value={Number(value.toFixed(3))}
                  inputProps={{ min: 0, max: 1, step: 0.01 }}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) updateRegion(region.id, { [key]: n });
                  }}
                  size="small"
                  disabled={disabled}
                  sx={{ flex: 1 }}
                />
              ))}
            </Stack>
            {front.regions.length > 1 && !disabled ? (
              <Button
                size="small"
                color="error"
                onClick={(e) => {
                  e.stopPropagation();
                  removeRegion(region.id);
                }}
              >
                Remove region
              </Button>
            ) : null}
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
