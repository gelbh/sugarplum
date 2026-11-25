import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import {
  normalizeDrag,
  pointerToCss,
  type DragRect,
  type SuggestedBox,
} from "./figureSuggestGeom";

export default function FigureSuggestPageStage({
  scanCount,
  pageCount,
  loadError,
  sourceCanvas,
  pageSuggestions,
  disabled,
  pointerBlocked,
  pageCssWidth,
  onRejectBox,
  onManualCrop,
}: {
  scanCount: number;
  pageCount: number;
  loadError: string | null;
  sourceCanvas: HTMLCanvasElement | null;
  pageSuggestions: SuggestedBox[];
  disabled: boolean;
  pointerBlocked: boolean;
  pageCssWidth: number;
  onRejectBox: (key: string) => void;
  onManualCrop: (cssBox: {
    x: number;
    y: number;
    w: number;
    h: number;
  }) => void;
}) {
  const pageViewRef = useRef<HTMLDivElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drag, setDrag] = useState<DragRect | null>(null);
  const [pageSize, setPageSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const source = sourceCanvas;
    const display = displayCanvasRef.current;
    if (!source || !display) {
      setPageSize({ w: 0, h: 0 });
      return;
    }
    display.width = source.width;
    display.height = source.height;
    display.style.width = `${source.clientWidth}px`;
    display.style.height = `${source.clientHeight}px`;
    const ctx = display.getContext("2d");
    if (ctx) ctx.drawImage(source, 0, 0);
    setPageSize({ w: source.clientWidth, h: source.clientHeight });
  }, [sourceCanvas]);

  function onPointerDown(ev: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || pointerBlocked) return;
    const el = pageViewRef.current;
    if (!el) return;
    el.setPointerCapture(ev.pointerId);
    const p = pointerToCss(ev, el);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }

  function onPointerMove(ev: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const el = pageViewRef.current;
    if (!el) return;
    const p = pointerToCss(ev, el);
    setDrag({ ...drag, x1: p.x, y1: p.y });
  }

  function onPointerUp(ev: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const el = pageViewRef.current;
    if (el) {
      try {
        el.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
    }
    const box = normalizeDrag(drag);
    setDrag(null);
    void onManualCrop(box);
  }

  const dragNorm = drag ? normalizeDrag(drag) : null;
  const { w: cssW, h: cssH } = pageSize;

  if (scanCount > 0) {
    return (
      <Box
        ref={pageViewRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        sx={{
          position: "relative",
          width: cssW || pageCssWidth,
          height: cssH || undefined,
          minHeight: cssH ? undefined : 120,
          maxWidth: "100%",
          touchAction: "none",
          userSelect: "none",
          cursor: disabled ? "default" : "crosshair",
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
        }}
      >
        <Box
          component="canvas"
          ref={displayCanvasRef}
          sx={{
            display: "block",
            width: cssW || "100%",
            height: cssH || "auto",
          }}
        />
        {pageSuggestions.map((box) => (
          <Box
            key={box.key}
            sx={{
              position: "absolute",
              left: box.x,
              top: box.y,
              width: Math.max(0, box.w),
              height: Math.max(0, box.h),
              border: "2px solid",
              borderColor: "primary.main",
              bgcolor: "rgba(25, 118, 210, 0.15)",
              boxSizing: "border-box",
              pointerEvents: "auto",
            }}
            onPointerDown={(ev) => ev.stopPropagation()}
          >
            <IconButton
              size="small"
              aria-label="Reject figure"
              disabled={disabled}
              onClick={() => onRejectBox(box.key)}
              sx={{
                position: "absolute",
                top: 0,
                right: 0,
                p: 0.25,
                bgcolor: "background.paper",
                "&:hover": { bgcolor: "background.paper" },
              }}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          </Box>
        ))}
        {dragNorm && dragNorm.w > 0 && dragNorm.h > 0 ? (
          <Box
            sx={{
              position: "absolute",
              left: dragNorm.x,
              top: dragNorm.y,
              width: dragNorm.w,
              height: dragNorm.h,
              border: "2px dashed",
              borderColor: "secondary.main",
              bgcolor: "rgba(156, 39, 176, 0.12)",
              pointerEvents: "none",
              boxSizing: "border-box",
            }}
          />
        ) : null}
      </Box>
    );
  }

  if (pageCount === 0 && !loadError) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Rendering pages…
      </Typography>
    );
  }

  return null;
}
