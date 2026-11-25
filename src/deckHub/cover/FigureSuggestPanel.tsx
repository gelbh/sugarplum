import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  MAX_CLIENT_FIGURES,
  MAX_PAGES_TO_SCAN,
  clampBoxToPage,
  listPdfPages,
  openPdfDocument,
  renderPageToCanvas,
  type EmbedPdfDocument,
  type EmbedPdfPageLayout,
} from "../../materials/clientKernel";
import {
  ensureLayoutSession,
  detectFigureBoxesOnCanvas,
} from "./layoutOnnx";
import { cropCanvasToPngFile } from "./pdfPageRender";
import FigureSuggestFilmstrip from "./FigureSuggestFilmstrip";
import FigureSuggestPageStage from "./FigureSuggestPageStage";
import { type SuggestedBox } from "./figureSuggestGeom";

export type FigureSuggestPanelProps = {
  pdfFile: File;
  disabled?: boolean;
  /** Controlled crop list (parent owns state). */
  crops: File[];
  onCropsChange: (files: File[]) => void;
};

const PAGE_CSS_WIDTH = 560;
const MIN_DRAG_CSS = 8;

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
  const [cropNotice, setCropNotice] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<HTMLCanvasElement | null>(
    null,
  );

  const pdfRef = useRef<EmbedPdfDocument | null>(null);
  const pagesRef = useRef<EmbedPdfPageLayout[]>([]);
  const canvasesRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
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
      setActivePage(0);
      setPageCount(0);
      setThumbUrls([]);
      setActiveSource(null);
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
    setActiveSource(canvasesRef.current.get(activePage) ?? null);
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

  const pageSuggestions = suggestions.filter((b) => b.pageIndex === activePage);

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Figure crops from PDF</Typography>
      <Typography
        variant="caption"
        sx={{
          color: "text.secondary",
        }}
      >
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

      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{
          flexWrap: "wrap",
        }}
      >
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
            alignSelf: "center",
          }}
        >
          {crops.length} / {MAX_CLIENT_FIGURES} accepted
          {scanCount < pageCount
            ? ` · scanning first ${scanCount} of ${pageCount} pages`
            : null}
        </Typography>
      </Stack>

      <FigureSuggestFilmstrip
        scanCount={scanCount}
        activePage={activePage}
        thumbUrls={thumbUrls}
        disabled={disabled}
        onSelectPage={setActivePage}
      />

      <FigureSuggestPageStage
        scanCount={scanCount}
        pageCount={pageCount}
        loadError={loadError}
        sourceCanvas={activeSource}
        pageSuggestions={pageSuggestions}
        disabled={disabled}
        pointerBlocked={busySuggest || busyAccept}
        pageCssWidth={PAGE_CSS_WIDTH}
        onRejectBox={rejectBox}
        onManualCrop={(box) => void appendManualCrop(box)}
      />
    </Stack>
  );
}
