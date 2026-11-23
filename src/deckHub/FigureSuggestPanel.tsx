import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";

import {
  MAX_CLIENT_FIGURES,
  MAX_PAGES_TO_SCAN,
  clampBoxToPage,
  type PageBox,
  listPdfPages,
  openPdfDocument,
  renderPageToCanvas,
  type EmbedPdfDocument,
  type EmbedPdfPageLayout,
} from "../materials/clientKernel";
import {
  ensureLayoutSession,
  detectFigureBoxesOnCanvas,
} from "./layoutOnnx";
import { cropCanvasToPngFile } from "./pdfPageRender";

export type FigureSuggestPanelProps = {
  pdfFile: File;
  disabled?: boolean;
  /** Controlled crop list (parent owns state). */
  crops: File[];
  onCropsChange: (files: File[]) => void;
};

const PAGE_CSS_WIDTH = 560;
const THUMB_CSS_WIDTH = 72;
const MIN_DRAG_CSS = 8;

type SuggestedBox = PageBox & { key: string };

type DragRect = { x0: number; y0: number; x1: number; y1: number };

function normalizeDrag(d: DragRect): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const x = Math.min(d.x0, d.x1);
  const y = Math.min(d.y0, d.y1);
  return { x, y, w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) };
}

function pointerToCss(
  ev: ReactPointerEvent,
  el: HTMLElement,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return {
    x: ev.clientX - rect.left,
    y: ev.clientY - rect.top,
  };
}

/** PDF page strip + ONNX figure suggest overlays + manual drag crop. */
export function FigureSuggestPanel({
  pdfFile,
  disabled = false,
  crops,
  onCropsChange,
}: FigureSuggestPanelProps) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [busySuggest, setBusySuggest] = useState(false);
  const [busyAccept, setBusyAccept] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const [thumbUrls, setThumbUrls] = useState<(string | null)[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedBox[]>([]);
  const [drag, setDrag] = useState<DragRect | null>(null);
  const [cropNotice, setCropNotice] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState({ w: 0, h: 0 });

  const pdfRef = useRef<EmbedPdfDocument | null>(null);
  const pagesRef = useRef<EmbedPdfPageLayout[]>([]);
  const canvasesRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageViewRef = useRef<HTMLDivElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropSeqRef = useRef(0);
  const cropsRef = useRef(crops);
  const onCropsChangeRef = useRef(onCropsChange);

  useEffect(() => {
    cropsRef.current = crops;
  }, [crops]);

  useEffect(() => {
    onCropsChangeRef.current = onCropsChange;
  }, [onCropsChange]);

  const scanCount = Math.min(pageCount, MAX_PAGES_TO_SCAN);

  const pushCrops = useCallback((next: File[]) => {
    onCropsChangeRef.current(next.slice(0, MAX_CLIENT_FIGURES));
  }, []);

  const ensurePageCanvas = useCallback(
    async (pageIndex: number): Promise<HTMLCanvasElement | null> => {
      const pdf = pdfRef.current;
      const layout = pagesRef.current[pageIndex];
      if (!pdf || !layout) return null;
      const cached = canvasesRef.current.get(pageIndex);
      if (cached) return cached;
      const canvas = await renderPageToCanvas(pdf, layout, PAGE_CSS_WIDTH);
      canvasesRef.current.set(pageIndex, canvas);
      return canvas;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadError(null);
      setSessionError(null);
      setSuggestions([]);
      setCropNotice(null);
      setDrag(null);
      setActivePage(0);
      setPageCount(0);
      setThumbUrls([]);
      setPageSize({ w: 0, h: 0 });
      canvasesRef.current.clear();
      pdfRef.current = null;
      pagesRef.current = [];
      cropSeqRef.current = 0;
      pushCrops([]);

      try {
        const buf = await pdfFile.arrayBuffer();
        if (cancelled) return;
        const pdf = await openPdfDocument(buf);
        if (cancelled) {
          await pdf.close();
          return;
        }
        const { pageCount: n, pages } = await listPdfPages(pdf);
        if (cancelled) {
          await pdf.close();
          return;
        }
        pdfRef.current = pdf;
        pagesRef.current = pages;
        setPageCount(n);
        const scan = Math.min(n, MAX_PAGES_TO_SCAN);
        setThumbUrls(Array.from({ length: scan }, () => null));

        for (let i = 0; i < scan; i++) {
          if (cancelled) return;
          const layout = pages[i];
          if (!layout) continue;
          const canvas = await renderPageToCanvas(pdf, layout, PAGE_CSS_WIDTH);
          if (cancelled) return;
          canvasesRef.current.set(i, canvas);
          const url = canvas.toDataURL("image/png");
          setThumbUrls((prev) => {
            const next = [...prev];
            next[i] = url;
            return next;
          });
          if (i === 0) {
            setPageSize({ w: canvas.clientWidth, h: canvas.clientHeight });
          }
        }
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error && err.message
            ? err.message
            : "Failed to load PDF pages";
        setLoadError(msg);
      }
    }

    void load();

    return () => {
      cancelled = true;
      const pdf = pdfRef.current;
      pdfRef.current = null;
      pagesRef.current = [];
      void pdf?.close();
      canvasesRef.current.clear();
    };
  }, [pdfFile, pushCrops]);

  useEffect(() => {
    const source = canvasesRef.current.get(activePage);
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
  }, [activePage, thumbUrls]);

  async function onSuggestFigures() {
    if (disabled || busySuggest || !pdfRef.current) return;
    setBusySuggest(true);
    setSessionError(null);
    setCropNotice(null);
    try {
      const loaded = await ensureLayoutSession();
      if (!loaded.ok) {
        setSessionError(
          loaded.reason ||
            "Figure suggest unavailable. You can still drag to crop manually.",
        );
        return;
      }

      const boxes: SuggestedBox[] = [];
      let keySeq = 0;
      for (let i = 0; i < scanCount; i++) {
        const canvas = await ensurePageCanvas(i);
        if (!canvas) continue;
        const detected = await detectFigureBoxesOnCanvas(canvas, i);
        if (!detected.ok) {
          setSessionError(
            detected.reason ||
              "Figure detect failed. You can still drag to crop manually.",
          );
          setSuggestions([]);
          return;
        }
        for (const box of detected.boxes) {
          boxes.push({ ...box, key: `s-${keySeq++}` });
        }
      }
      setSuggestions(boxes);
      if (boxes.length === 0) {
        setCropNotice("No figures detected. Drag on a page to crop manually.");
      }
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Figure suggest failed. You can still drag to crop manually.";
      setSessionError(msg);
    } finally {
      setBusySuggest(false);
    }
  }

  function rejectBox(key: string) {
    setSuggestions((prev) => prev.filter((b) => b.key !== key));
  }

  async function acceptRemaining() {
    if (disabled || busyAccept || suggestions.length === 0) return;
    setBusyAccept(true);
    setCropNotice(null);
    try {
      const room = MAX_CLIENT_FIGURES - cropsRef.current.length;
      if (room <= 0) {
        setCropNotice(`Figure crop limit is ${MAX_CLIENT_FIGURES}.`);
        return;
      }
      const toAccept = suggestions.slice(0, room);
      const next = [...cropsRef.current];
      let skipped = 0;
      for (const box of toAccept) {
        const canvas = await ensurePageCanvas(box.pageIndex);
        if (!canvas) {
          skipped += 1;
          continue;
        }
        const clamped = clampBoxToPage(
          box,
          canvas.clientWidth,
          canvas.clientHeight,
        );
        if (clamped.w < 1 || clamped.h < 1) {
          skipped += 1;
          continue;
        }
        try {
          cropSeqRef.current += 1;
          const file = await cropCanvasToPngFile(
            canvas,
            clamped,
            `figure-p${box.pageIndex + 1}-${cropSeqRef.current}.png`,
          );
          next.push(file);
        } catch {
          skipped += 1;
        }
      }
      pushCrops(next);
      setSuggestions((prev) =>
        prev.filter((b) => !toAccept.some((a) => a.key === b.key)),
      );
      if (skipped > 0) {
        setCropNotice(`Skipped ${skipped} crop${skipped === 1 ? "" : "s"}.`);
      } else if (suggestions.length > room) {
        setCropNotice(
          `Accepted ${room}; figure crop limit is ${MAX_CLIENT_FIGURES}.`,
        );
      }
    } finally {
      setBusyAccept(false);
    }
  }

  async function appendManualCrop(cssBox: {
    x: number;
    y: number;
    w: number;
    h: number;
  }) {
    if (disabled) return;
    if (cropsRef.current.length >= MAX_CLIENT_FIGURES) {
      setCropNotice(`Figure crop limit is ${MAX_CLIENT_FIGURES}.`);
      return;
    }
    const canvas = await ensurePageCanvas(activePage);
    if (!canvas) return;
    const clamped = clampBoxToPage(
      {
        pageIndex: activePage,
        x: cssBox.x,
        y: cssBox.y,
        w: cssBox.w,
        h: cssBox.h,
        score: 1,
        label: "manual",
      },
      canvas.clientWidth,
      canvas.clientHeight,
    );
    if (clamped.w < MIN_DRAG_CSS || clamped.h < MIN_DRAG_CSS) return;
    try {
      cropSeqRef.current += 1;
      const file = await cropCanvasToPngFile(
        canvas,
        clamped,
        `figure-p${activePage + 1}-${cropSeqRef.current}.png`,
      );
      pushCrops([...cropsRef.current, file]);
      setCropNotice(null);
    } catch (err) {
      const msg =
        err instanceof Error && err.message ? err.message : "Crop failed";
      setCropNotice(msg);
    }
  }

  function onPointerDown(ev: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || busySuggest || busyAccept) return;
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
    void appendManualCrop(box);
  }

  const pageSuggestions = suggestions.filter((b) => b.pageIndex === activePage);
  const dragNorm = drag ? normalizeDrag(drag) : null;
  const { w: cssW, h: cssH } = pageSize;

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Figure crops from PDF</Typography>
      <Typography variant="caption" sx={{
        color: "text.secondary"
      }}>
        Suggest figures on-device, or drag a rectangle on the page. Max{" "}
        {MAX_CLIENT_FIGURES} PNG crops.
      </Typography>

      {loadError ? <Alert severity="error">{loadError}</Alert> : null}
      {sessionError ? (
        <Alert severity="warning" onClose={() => setSessionError(null)}>
          {sessionError}
        </Alert>
      ) : null}
      {cropNotice ? (
        <Alert severity="info" onClose={() => setCropNotice(null)}>
          {cropNotice}
        </Alert>
      ) : null}

      <Stack direction="row" spacing={1} useFlexGap sx={{
        flexWrap: "wrap"
      }}>
        <Button
          variant="outlined"
          size="small"
          disabled={disabled || busySuggest || !!loadError || scanCount === 0}
          onClick={() => void onSuggestFigures()}
        >
          {busySuggest ? "Suggesting…" : "Suggest figures"}
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={
            disabled || busyAccept || suggestions.length === 0 || busySuggest
          }
          onClick={() => void acceptRemaining()}
        >
          {busyAccept
            ? "Accepting…"
            : `Accept remaining (${suggestions.length})`}
        </Button>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            alignSelf: "center"
          }}>
          {crops.length} / {MAX_CLIENT_FIGURES} accepted
          {scanCount < pageCount
            ? ` · scanning first ${scanCount} of ${pageCount} pages`
            : null}
        </Typography>
      </Stack>

      {scanCount > 0 ? (
        <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }}>
          {Array.from({ length: scanCount }, (_, i) => (
            <Box
              key={i}
              component="button"
              type="button"
              disabled={disabled}
              onClick={() => setActivePage(i)}
              sx={{
                border: activePage === i ? "2px solid" : "1px solid",
                borderColor: activePage === i ? "primary.main" : "divider",
                borderRadius: 1,
                p: 0.25,
                bgcolor: "background.paper",
                cursor: disabled ? "default" : "pointer",
                flexShrink: 0,
                lineHeight: 0,
              }}
            >
              {thumbUrls[i] ? (
                <Box
                  component="img"
                  src={thumbUrls[i]!}
                  alt={`Page ${i + 1}`}
                  sx={{ width: THUMB_CSS_WIDTH, display: "block" }}
                />
              ) : (
                <Box
                  sx={{
                    width: THUMB_CSS_WIDTH,
                    height: THUMB_CSS_WIDTH * 1.3,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Typography variant="caption">{i + 1}</Typography>
                </Box>
              )}
            </Box>
          ))}
        </Stack>
      ) : null}

      {scanCount > 0 ? (
        <Box
          ref={pageViewRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
          sx={{
            position: "relative",
            width: cssW || PAGE_CSS_WIDTH,
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
                onClick={() => rejectBox(box.key)}
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
      ) : pageCount === 0 && !loadError ? (
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          Rendering pages…
        </Typography>
      ) : null}
    </Stack>
  );
}
