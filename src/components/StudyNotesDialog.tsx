import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { TextItem, TextMarkedContent } from "pdfjs-dist/types/src/display/api";
import {
  downloadMaterialUrl,
  getJob,
  listMaterials,
  patchCardProvenancePages,
} from "../api/client";
import { isGuest } from "../guest/session";
import {
  loadPdfDocument,
  renderPdfPageToCanvas,
} from "../lib/pdfPageRender";
import {
  excerptHighlightRects,
  type TextRun,
} from "../study/excerptHighlight";
import {
  normalizeExcerptText,
  resolveNotesDisplayPage,
  type PageText,
} from "../study/excerptPages";
import {
  clampNotesPage,
  pagesToPersistAfterNavigate,
  pagesToPersistAfterRescue,
} from "../study/notesProvenanceWrite";

const PAGE_WIDTH_FALLBACK = 320;
const FILE_ERROR = "Could not open the file.";
const HIGHLIGHT =
  "color-mix(in srgb, var(--sp-grade-good-wash) 70%, transparent)";

type Props = {
  open: boolean;
  onClose: () => void;
  excerpt: string;
  page: number | null;
  jobId: string | null;
  cardId?: string | null;
};

type Matrix6 = TextRun["transform"];

type PageView = {
  canvas: HTMLCanvasElement;
  rects: { x: number; y: number; w: number; h: number }[];
  pageText: string;
};

function matrix6(raw: unknown): Matrix6 | null {
  if (!Array.isArray(raw) || raw.length < 6) return null;
  const nums = raw.slice(0, 6);
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  return [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
}

function isTextItem(
  item: TextItem | TextMarkedContent,
): item is TextItem {
  return "str" in item && typeof (item as TextItem).str === "string";
}

function textRuns(items: readonly (TextItem | TextMarkedContent)[]): TextRun[] {
  const runs: TextRun[] = [];
  for (const item of items) {
    if (!isTextItem(item)) continue;
    if (typeof item.width !== "number" || typeof item.height !== "number") {
      continue;
    }
    const transform = matrix6(item.transform);
    if (!transform) continue;
    runs.push({
      str: item.str,
      width: item.width,
      height: item.height,
      transform,
    });
  }
  return runs;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export default function StudyNotesDialog({
  open,
  onClose,
  excerpt,
  page,
  jobId,
  cardId = null,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const userNavRef = useRef(false);
  const wrotePagesRef = useRef<string>("");
  const writeSeqRef = useRef(0);
  const writeChainRef = useRef(Promise.resolve());
  const lastPersistedFirstRef = useRef<number | null>(null);
  const [title, setTitle] = useState("Notes");
  const [error, setError] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [width, setWidth] = useState(PAGE_WIDTH_FALLBACK);
  const [pageView, setPageView] = useState<PageView | null>(null);
  const [viewPage, setViewPage] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageInput, setPageInput] = useState("");

  function persistPages(pages: number[] | null) {
    if (!cardId || isGuest() || !pages || pages.length === 0) return;
    const key = `${cardId}:${pages.join(",")}`;
    if (wrotePagesRef.current === key) return;
    wrotePagesRef.current = key;
    lastPersistedFirstRef.current = pages[0] ?? null;
    const seq = ++writeSeqRef.current;
    const id = cardId;
    writeChainRef.current = writeChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (writeSeqRef.current !== seq) return;
        try {
          await patchCardProvenancePages(id, pages);
        } catch {
          if (writeSeqRef.current === seq && wrotePagesRef.current === key) {
            wrotePagesRef.current = "";
          }
        }
      });
  }

  useLayoutEffect(() => {
    if (!open) {
      setWidth(PAGE_WIDTH_FALLBACK);
      return;
    }
    const node = frameRef.current;
    if (!node) return;
    const apply = () => {
      const next = Math.floor(node.clientWidth);
      if (next >= 1) setWidth((prev) => (prev === next ? prev : next));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setViewPage(null);
      setPageCount(0);
      setPageInput("");
      userNavRef.current = false;
      wrotePagesRef.current = "";
      writeSeqRef.current = 0;
      lastPersistedFirstRef.current = page;
      return;
    }
    userNavRef.current = false;
    wrotePagesRef.current = "";
    writeSeqRef.current = 0;
    lastPersistedFirstRef.current = page;
    setViewPage(page);
    setPageInput(page != null ? String(page) : "");
  }, [open, page, cardId]);

  useEffect(() => {
    if (!open || !jobId || isGuest()) {
      setTitle("Notes");
      setError(null);
      setPdfBytes(null);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setTitle("Notes");
    setError(null);
    setPdfBytes(null);

    void (async () => {
      try {
        // Material stays on the source deck after a card move; resolve by id.
        const [job, materials] = await Promise.all([
          getJob(jobId),
          listMaterials(),
        ]);
        if (cancelled) return;
        const material = materials.find((item) => item.id === job.material_id);
        if (!material) {
          setError(FILE_ERROR);
          return;
        }
        setTitle(material.filename || "Notes");
        if (material.kind !== "pdf" || page === null) return;
        const response = await fetch(downloadMaterialUrl(material.id), {
          credentials: "include",
          signal: ac.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        setPdfBytes(bytes);
      } catch (err) {
        if (cancelled || isAbort(err)) return;
        setError(FILE_ERROR);
        setPdfBytes(null);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [open, jobId, page]);

  useEffect(() => {
    if (!open || !pdfBytes || viewPage === null) {
      setPageView(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      let pdf: Awaited<ReturnType<typeof loadPdfDocument>> | null = null;
      try {
        const copy = pdfBytes.slice();
        pdf = await loadPdfDocument(copy.buffer as ArrayBuffer);
        const needle = normalizeExcerptText(excerpt);
        const total = pdf.numPages;
        if (!cancelled) {
          setPageCount(total);
        }

        async function pagePlainText(pageNum: number): Promise<string> {
          const pdfPage = await pdf!.getPage(pageNum);
          const content = await pdfPage.getTextContent();
          return textRuns(content.items)
            .map((run) => run.str)
            .join(" ");
        }

        async function washOnPage(pageNum: number): Promise<PageView> {
          const pdfPage = await pdf!.getPage(pageNum);
          const viewport = pdfPage.getViewport({ scale: 1 });
          const viewportTransform = matrix6(viewport.transform);
          if (
            !viewportTransform ||
            !(viewport.width > 0) ||
            !(viewport.height > 0)
          ) {
            throw new Error("viewport");
          }
          const canvas = await renderPdfPageToCanvas(pdf!, pageNum - 1, width);
          const content = await pdfPage.getTextContent();
          const runs = textRuns(content.items);
          const rects = excerptHighlightRects(
            runs,
            excerpt,
            viewportTransform,
          );
          const cssW = Number.parseFloat(canvas.style.width);
          const cssH = Number.parseFloat(canvas.style.height);
          const sx = cssW / viewport.width;
          const sy = cssH / viewport.height;
          return {
            canvas,
            pageText: runs.map((run) => run.str).join(" "),
            rects: rects.map((rect) => ({
              x: rect.x * sx,
              y: rect.y * sy,
              w: rect.w * sx,
              h: rect.h * sy,
            })),
          };
        }

        let displayPage = viewPage;
        let view = await washOnPage(displayPage);
        if (cancelled) return;
        setError(null);
        setPageView(view);

        const allowRescue = !userNavRef.current && page !== null;
        if (allowRescue && needle && view.rects.length === 0) {
          try {
            const scanned: PageText[] = [
              { page: displayPage, text: view.pageText },
            ];
            let rescuedPage: number | null = null;
            for (let pageNum = 1; pageNum <= total; pageNum++) {
              if (cancelled) return;
              if (pageNum === displayPage) continue;
              let text = "";
              try {
                text = await pagePlainText(pageNum);
              } catch {
                continue;
              }
              scanned.push({ page: pageNum, text });
              if (rescuedPage === null) {
                const rescued = resolveNotesDisplayPage({
                  claimed: displayPage,
                  excerpt,
                  pages: scanned,
                });
                if (rescued !== null && rescued !== displayPage) {
                  rescuedPage = rescued;
                  displayPage = rescued;
                  view = await washOnPage(displayPage);
                  if (cancelled) return;
                  setPageView(view);
                  setViewPage(displayPage);
                  setPageInput(String(displayPage));
                }
              }
            }
            if (rescuedPage !== null) {
              persistPages(
                pagesToPersistAfterRescue({
                  claimed: page!,
                  rescued: rescuedPage,
                  excerpt,
                  scanned,
                  scanComplete: true,
                }),
              );
            }
          } catch {
            /* keep claimed-page view already shown */
          }
        } else if (userNavRef.current && page !== null) {
          persistPages(
            pagesToPersistAfterNavigate({
              storedFirst: lastPersistedFirstRef.current,
              displayPage,
              excerpt,
              pageTexts: [{ page: displayPage, text: view.pageText }],
            }),
          );
        }
      } catch {
        if (cancelled) return;
        setPageView(null);
        setError(FILE_ERROR);
      } finally {
        await pdf?.cleanup()?.catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
    // page is claimed provenance; viewPage drives render/scrubber.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persistPages closes over cardId
  }, [open, pdfBytes, viewPage, excerpt, width, page, cardId]);

  useLayoutEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    host.replaceChildren();
    if (pageView) host.append(pageView.canvas);
  }, [pageView, open]);

  function goToPage(next: number) {
    const clamped = clampNotesPage(next, pageCount);
    if (clamped === null) {
      setPageInput(viewPage != null ? String(viewPage) : "");
      return;
    }
    if (clamped === viewPage) {
      setPageInput(String(viewPage));
      return;
    }
    userNavRef.current = true;
    setViewPage(clamped);
    setPageInput(String(clamped));
  }

  const scrubberReady = pageCount >= 1 && viewPage !== null && pdfBytes;

  return (
    <Dialog open={open} onClose={() => onClose()} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {excerpt ? (
          <Typography sx={{ whiteSpace: "pre-wrap", mb: 2 }}>{excerpt}</Typography>
        ) : null}
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Box ref={frameRef} sx={{ width: "100%" }}>
          <Box sx={{ position: "relative", width: "fit-content", maxWidth: "100%" }}>
            <Box
              ref={canvasHostRef}
              sx={{ "& canvas": { display: "block" } }}
            />
            {pageView
              ? pageView.rects.map((rect, index) => (
                  <Box
                    key={`${index}:${rect.x}:${rect.y}`}
                    sx={{
                      position: "absolute",
                      left: rect.x,
                      top: rect.y,
                      width: rect.w,
                      height: rect.h,
                      backgroundColor: HIGHLIGHT,
                      pointerEvents: "none",
                    }}
                  />
                ))
              : null}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1, justifyContent: "space-between" }}>
        {scrubberReady ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Button
              size="small"
              disabled={viewPage! <= 1}
              onClick={() => goToPage(viewPage! - 1)}
            >
              Prev
            </Button>
            <Typography variant="body2" component="span">
              Page
            </Typography>
            <TextField
              size="small"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => {
                const n = Number.parseInt(pageInput, 10);
                if (Number.isFinite(n)) goToPage(n);
                else setPageInput(String(viewPage));
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const n = Number.parseInt(pageInput, 10);
                if (Number.isFinite(n)) goToPage(n);
                else setPageInput(String(viewPage));
              }}
              inputProps={{
                inputMode: "numeric",
                "aria-label": "Page number",
                style: { width: "3rem", textAlign: "center" },
              }}
            />
            <Typography variant="body2" component="span">
              of {pageCount}
            </Typography>
            <Button
              size="small"
              disabled={viewPage! >= pageCount}
              onClick={() => goToPage(viewPage! + 1)}
            >
              Next
            </Button>
          </Box>
        ) : (
          <span />
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
