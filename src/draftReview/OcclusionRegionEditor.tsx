import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import { alpha } from "@mui/material/styles";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { mediaUrl, type OcclusionFrontView } from "../api/client";

export type OcclusionRegion = OcclusionFrontView["regions"][number];

export type OcclusionRegionEditorProps = {
  front: OcclusionFrontView;
  disabled?: boolean;
  onChange: (next: {
    front: OcclusionFrontView;
    back: { answer: string };
  }) => void;
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

const MAX_REGIONS = 8;

function clampRegion(r: OcclusionRegion): OcclusionRegion {
  const w = Math.min(Math.max(r.w, 0.02), 1);
  const h = Math.min(Math.max(r.h, 0.02), 1);
  const x = clamp01(Math.min(r.x, 1 - w));
  const y = clamp01(Math.min(r.y, 1 - h));
  return { ...r, x, y, w, h };
}

function nextManualRegionId(regions: OcclusionRegion[]): string {
  let n = regions.length + 1;
  const used = new Set(regions.map((r) => r.id));
  while (used.has(`r${n}`)) n += 1;
  return `r${n}`;
}

function createManualRegion(regions: OcclusionRegion[]): OcclusionRegion {
  const n = regions.length + 1;
  return clampRegion({
    id: nextManualRegionId(regions),
    label: `Region ${n}`,
    x: 0.25,
    y: 0.25,
    w: 0.5,
    h: 0.2,
  });
}

function answerFromRegions(
  regions: OcclusionRegion[],
  selectedId: string | null,
): string {
  const selected =
    regions.find((r) => r.id === selectedId) ?? regions[0] ?? null;
  return selected?.label.trim() || selected?.id || "region";
}

async function decodeImageNaturalSize(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap !== "undefined") {
    const bitmap = await createImageBitmap(blob);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image dimensions"));
    };
    img.src = url;
  });
}

function suggestErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (raw.includes("failed to load") || raw.includes("OCR worker")) {
    return "Could not load on-device OCR. Try again, or edit regions manually.";
  }
  if (raw.includes("recognition failed") || raw.includes("OCR recognition")) {
    return "OCR could not read this image. Try again, or edit regions manually.";
  }
  if (raw.includes("Image fetch") || raw.includes("decode")) {
    return "Could not load the crop image for OCR.";
  }
  return "Could not suggest regions.";
}

/** Image + overlay region boxes (drag/resize); study reveal uses region labels. */
export default function OcclusionRegionEditor({
  front,
  disabled = false,
  onChange,
}: OcclusionRegionEditorProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef(front);
  const suggestGenRef = useRef(0);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    front.regions[0]?.id ?? null,
  );
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [suggestNotice, setSuggestNotice] = useState<{
    severity: "error" | "warning" | "info";
    message: string;
  } | null>(null);

  frontRef.current = front;
  const editLocked = disabled || suggestBusy;

  const cancelSuggest = useCallback(() => {
    suggestGenRef.current += 1;
    suggestAbortRef.current?.abort();
    suggestAbortRef.current = null;
    setSuggestBusy(false);
  }, []);

  useEffect(() => () => cancelSuggest(), [cancelSuggest]);

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

  const runSuggestRegions = useCallback(async () => {
    const gen = ++suggestGenRef.current;
    const startedKey = front.image_key;
    suggestAbortRef.current?.abort();
    const abort = new AbortController();
    suggestAbortRef.current = abort;
    setSuggestBusy(true);
    setSuggestNotice(null);
    try {
      const res = await fetch(mediaUrl(startedKey), {
        credentials: "same-origin",
        signal: abort.signal,
      });
      if (!res.ok) {
        throw new Error(`Image fetch failed (${res.status})`);
      }
      const blob = await res.blob();
      const { width, height } = await decodeImageNaturalSize(blob);
      const { suggestOcclusionRegions } = await import("./occlusionOcr");
      const regions = await suggestOcclusionRegions(blob, width, height);
      if (gen !== suggestGenRef.current) return;
      if (frontRef.current.image_key !== startedKey) return;
      if (regions.length === 0) {
        setSuggestNotice({
          severity: "warning",
          message:
            "No text regions found on this image. Adjust the crop or add regions manually.",
        });
        return;
      }
      const clamped = regions.map((r) => clampRegion(r));
      const firstId = clamped[0]?.id ?? null;
      setSelectedId(firstId);
      emit({ ...frontRef.current, regions: clamped }, firstId);
    } catch (err) {
      if (gen !== suggestGenRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setSuggestNotice({
        severity: "error",
        message: suggestErrorMessage(err),
      });
    } finally {
      if (gen === suggestGenRef.current) {
        setSuggestBusy(false);
        suggestAbortRef.current = null;
      }
    }
  }, [emit, front.image_key]);

  function onSuggestRegionsClick() {
    if (editLocked) return;
    if (front.regions.length > 0) {
      setConfirmReplaceOpen(true);
    } else {
      void runSuggestRegions();
    }
  }

  function onConfirmReplaceRegions() {
    setConfirmReplaceOpen(false);
    void runSuggestRegions();
  }

  function addRegion() {
    if (editLocked || front.regions.length >= MAX_REGIONS) return;
    const region = createManualRegion(front.regions);
    const regions = [...front.regions, region];
    setSelectedId(region.id);
    emit({ ...front, regions }, region.id);
  }

  function removeRegion(id: string) {
    if (editLocked) return;
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
    if (editLocked) return;
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
    if (!drag || editLocked) return;
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

  const hasImage = Boolean(front.image_key.trim());

  return (
    <Stack spacing={2}>
      {hasImage ? (
        <Box
          sx={{
            maxHeight: "42vh",
            minHeight: 160,
            flexShrink: 0,
            overflow: "auto",
            borderRadius: 2,
            bgcolor: "rgba(18, 7, 15, 0.65)",
            border: "1px solid",
            borderColor: "rgba(232, 216, 199, 0.16)",
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
              alt=""
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
                    cursor: editLocked ? "default" : "move",
                    borderRadius: "4px",
                    boxShadow: selected
                      ? "0 2px 10px color-mix(in srgb, var(--sp-plum) 28%, transparent)"
                      : "none",
                  }}
                >
                  {!editLocked ? (
                    <Box
                      onPointerDown={(e) =>
                        onBoxPointerDown(e, region, "resize")
                      }
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
      ) : (
        <Box
          sx={{
            minHeight: 160,
            px: 2.5,
            py: 3,
            borderRadius: 2,
            border: "1px dashed",
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            textAlign: "center",
          }}
        >
          <ImageOutlinedIcon sx={{ fontSize: 28, color: "primary.light" }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Image required
          </Typography>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            Upload or pick a deck image, then drag boxes over labels.
          </Typography>
        </Box>
      )}

      {hasImage ? (
        <>
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
            disabled={editLocked}
          />

          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              maxWidth: "42ch"
            }}>
            Hide one region per card. Add a box or use Suggest, then drag to
            move and corner to resize.
          </Typography>

          {suggestNotice ? (
            <Alert
              severity={suggestNotice.severity}
              onClose={() => setSuggestNotice(null)}
            >
              {suggestNotice.message}
            </Alert>
          ) : null}

          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              flexWrap: "wrap"
            }}>
            <Button
              variant="contained"
              size="small"
              onClick={addRegion}
              disabled={editLocked || front.regions.length >= MAX_REGIONS}
            >
              Add region
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={onSuggestRegionsClick}
              disabled={editLocked}
              aria-busy={suggestBusy || undefined}
            >
              {suggestBusy ? "Suggesting…" : "Suggest regions"}
            </Button>
            {suggestBusy ? (
              <Button variant="text" size="small" onClick={cancelSuggest}>
                Cancel
              </Button>
            ) : null}
            {suggestBusy ? (
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                First OCR run may take a moment.
              </Typography>
            ) : front.regions.length >= MAX_REGIONS ? (
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                At most {MAX_REGIONS} regions per card.
              </Typography>
            ) : null}
          </Stack>

          <Dialog
            open={confirmReplaceOpen}
            onClose={() => !suggestBusy && setConfirmReplaceOpen(false)}
          >
            <DialogTitle>Replace existing regions?</DialogTitle>
            <DialogContent>
              <DialogContentText>
                OCR will replace your current region boxes with new suggestions.
                You can still move and resize boxes afterward.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setConfirmReplaceOpen(false)}
                disabled={suggestBusy}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={onConfirmReplaceRegions}
                disabled={suggestBusy}
                autoFocus
              >
                Replace
              </Button>
            </DialogActions>
          </Dialog>

          {front.regions.length > 0 ? (
            <Stack spacing={1.5}>
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: "baseline",
                  justifyContent: "space-between"
                }}>
                <Typography
                  component="h3"
                  sx={{
                    m: 0,
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "text.secondary",
                  }}
                >
                  Regions
                </Typography>
                <Typography
                  component="span"
                  sx={{
                    fontSize: "0.75rem",
                    color: "text.secondary",
                    opacity: 0.8,
                  }}
                >
                  {front.regions.length} of {MAX_REGIONS}
                </Typography>
              </Stack>
              <Stack spacing={1}>
                {front.regions.map((region, index) => {
                  const selected = region.id === selectedId;
                  return (
                    <Box
                      key={region.id}
                      role="button"
                      tabIndex={editLocked ? -1 : 0}
                      aria-pressed={selected}
                      onClick={() => {
                        if (editLocked) return;
                        setSelectedId(region.id);
                        emit(front, region.id);
                      }}
                      onKeyDown={(e) => {
                        if (editLocked) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(region.id);
                          emit(front, region.id);
                        }
                      }}
                      sx={(theme) => ({
                        px: 1.25,
                        py: 1,
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: selected
                          ? alpha(theme.palette.primary.main, 0.55)
                          : "rgba(232, 216, 199, 0.12)",
                        bgcolor: selected
                          ? alpha(theme.palette.primary.main, 0.12)
                          : "rgba(18, 7, 15, 0.35)",
                        boxShadow: selected
                          ? `inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.25)}`
                          : "none",
                        cursor: editLocked ? "default" : "pointer",
                        transition:
                          "border-color 120ms ease, background-color 120ms ease",
                        "&:hover": editLocked
                          ? undefined
                          : {
                              borderColor: selected
                                ? alpha(theme.palette.primary.main, 0.7)
                                : "rgba(232, 216, 199, 0.22)",
                              bgcolor: selected
                                ? alpha(theme.palette.primary.main, 0.16)
                                : "rgba(18, 7, 15, 0.5)",
                            },
                      })}
                    >
                      <Stack direction="row" spacing={1} sx={{
                        alignItems: "center"
                      }}>
                        <Box
                          aria-hidden
                          sx={(theme) => ({
                            width: 28,
                            height: 28,
                            borderRadius: 1,
                            flexShrink: 0,
                            display: "grid",
                            placeItems: "center",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            fontVariantNumeric: "tabular-nums",
                            color: selected
                              ? theme.palette.primary.light
                              : "text.secondary",
                            bgcolor: selected
                              ? alpha(theme.palette.primary.main, 0.22)
                              : "rgba(232, 216, 199, 0.06)",
                          })}
                        >
                          {index + 1}
                        </Box>
                        <Typography
                          component="p"
                          sx={{
                            m: 0,
                            flex: 1,
                            minWidth: 0,
                            fontSize: "0.875rem",
                            fontWeight: 500,
                            color: selected
                              ? "primary.light"
                              : "text.primary",
                          }}
                        >
                          Region {index + 1}
                          {selected ? " · selected" : ""}
                        </Typography>
                        {!editLocked ? (
                          <IconButton
                            size="small"
                            aria-label={`Remove region ${index + 1}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeRegion(region.id);
                            }}
                            sx={{
                              flexShrink: 0,
                              color: "text.secondary",
                              "&:hover": { color: "error.light" },
                            }}
                          >
                            <DeleteOutlinedIcon fontSize="small" />
                          </IconButton>
                        ) : null}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            </Stack>
          ) : null}
        </>
      ) : null}
    </Stack>
  );
}
