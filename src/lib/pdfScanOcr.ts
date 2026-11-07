import { createWorker, OEM } from "tesseract.js";
import { loadPdfDocument, renderPdfPageToCanvas } from "./pdfPageRender";

/** Match the worker sidecar cap. Upload text-layer scan stays at 120 pages. */
export const OCR_EMPTY_PAGE_LIMIT = 8;
export const OCR_TEXT_LAYER_SCAN_LIMIT = 120;
/** Refill may read blanks through this page. Upload OCR does not. */
export const OCR_REFILL_PAGE_MAX = 2000;
export const OCR_PAGE_CHAR_CAP = 8_000;

const OCR_WORKER_PATH = "/ocr/worker.min.js";
const OCR_CORE_PATH = "/ocr/core";
const OCR_LANG_PATH = "/ocr";
const OCR_RENDER_CSS_WIDTH = 1000;

export type PageText = { page: number; text: string };

type ScanWorker = Awaited<ReturnType<typeof createWorker>>;

let scanWorker: ScanWorker | null = null;
let scanLoad: Promise<ScanWorker> | null = null;

export function selectEmptyPages(pages: readonly PageText[]): PageText[] {
  const scanned = pages
    .filter(
      (page) =>
        page.page >= 1 && page.page <= OCR_TEXT_LAYER_SCAN_LIMIT,
    )
    .sort((a, b) => a.page - b.page)
    .slice(0, OCR_TEXT_LAYER_SCAN_LIMIT);
  const empty: PageText[] = [];
  for (const page of scanned) {
    if (page.text.trim()) continue;
    empty.push(page);
    if (empty.length >= OCR_EMPTY_PAGE_LIMIT) break;
  }
  return empty;
}

export function ocrRefillWindow(
  startPage: number,
): { start: number; end: number } | null {
  if (
    !Number.isInteger(startPage) ||
    startPage < 1 ||
    startPage > OCR_REFILL_PAGE_MAX
  ) {
    return null;
  }
  return {
    start: startPage,
    end: Math.min(
      OCR_REFILL_PAGE_MAX,
      startPage + OCR_TEXT_LAYER_SCAN_LIMIT - 1,
    ),
  };
}

/** Inclusive end page for refill lookbehind text-layer scan (1..scanEnd). */
export function refillLookbehindScanEnd(
  startPage: number,
  numPages: number,
): number {
  return startPage > OCR_REFILL_PAGE_MAX
    ? Math.min(numPages, OCR_REFILL_PAGE_MAX)
    : Math.min(startPage - 1, numPages, OCR_REFILL_PAGE_MAX);
}

export function selectEmptyPagesInWindow(
  pages: readonly PageText[],
  args: { startPage: number; covered: readonly number[] },
): PageText[] {
  const covered = new Set(args.covered);
  const ordered = pages.slice().sort((a, b) => a.page - b.page);
  const empty: PageText[] = [];
  const window = ocrRefillWindow(args.startPage);
  if (window) {
    for (const page of ordered) {
      if (page.page < window.start || page.page > window.end) continue;
      if (covered.has(page.page) || page.text.trim()) continue;
      empty.push(page);
      if (empty.length >= OCR_EMPTY_PAGE_LIMIT) return empty;
    }
  }
  for (const page of ordered) {
    if (page.page < 1 || page.page >= args.startPage) continue;
    if (page.page > OCR_REFILL_PAGE_MAX) continue;
    if (covered.has(page.page) || page.text.trim()) continue;
    empty.push(page);
    if (empty.length >= OCR_EMPTY_PAGE_LIMIT) break;
  }
  return empty;
}

export function capOcrPageText(text: string): string {
  return text.trim().slice(0, OCR_PAGE_CHAR_CAP);
}

async function ensureScanWorker(): Promise<ScanWorker> {
  if (scanWorker) return scanWorker;
  if (scanLoad) return scanLoad;
  scanLoad = (async () => {
    try {
      const worker = await createWorker("eng", OEM.LSTM_ONLY, {
        workerPath: OCR_WORKER_PATH,
        corePath: OCR_CORE_PATH,
        langPath: OCR_LANG_PATH,
      });
      scanWorker = worker;
      return worker;
    } catch (err) {
      scanLoad = null;
      scanWorker = null;
      throw err;
    }
  })();
  return scanLoad;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("OCR canvas was empty"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

export async function ocrEmptyPdfPages(
  data: ArrayBuffer,
): Promise<PageText[] | undefined> {
  let worker: ScanWorker;
  try {
    worker = await ensureScanWorker();
  } catch (err) {
    console.warn("PDF scan OCR worker failed to load", err);
    return undefined;
  }

  const pdf = await loadPdfDocument(data);
  try {
    const limit = Math.min(pdf.numPages, OCR_TEXT_LAYER_SCAN_LIMIT);
    const rows: PageText[] = [];
    for (let n = 1; n <= limit; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item && typeof item.str === "string" ? item.str : "",
        )
        .join(" ");
      rows.push({ page: n, text });
    }
    const out: PageText[] = [];
    for (const row of selectEmptyPages(rows)) {
      try {
        const canvas = await renderPdfPageToCanvas(
          pdf,
          row.page - 1,
          OCR_RENDER_CSS_WIDTH,
        );
        const recognized = await worker.recognize(await canvasToBlob(canvas));
        const text = capOcrPageText(
          typeof recognized.data.text === "string" ? recognized.data.text : "",
        );
        if (text) out.push({ page: row.page, text });
      } catch (err) {
        console.warn(`PDF scan OCR skipped page ${row.page}`, err);
      }
    }
    return out.length > 0 ? out : undefined;
  } finally {
    await pdf.cleanup();
  }
}

export async function ocrEmptyPdfPagesInWindow(
  data: ArrayBuffer,
  args: { startPage: number; covered: readonly number[] },
): Promise<PageText[] | undefined> {
  let worker: ScanWorker;
  try {
    worker = await ensureScanWorker();
  } catch (err) {
    console.warn("PDF scan OCR worker failed to load", err);
    return undefined;
  }

  const pdf = await loadPdfDocument(data);
  try {
    const startPage = args.startPage;
    if (!Number.isInteger(startPage) || startPage < 1) return undefined;
    const numPages = pdf.numPages;
    const rows: PageText[] = [];
    const readTextLayer = async (pageNumber: number): Promise<void> => {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item && typeof item.str === "string" ? item.str : "",
        )
        .join(" ");
      rows.push({ page: pageNumber, text });
    };
    if (startPage <= OCR_REFILL_PAGE_MAX && startPage <= numPages) {
      const end = Math.min(
        OCR_REFILL_PAGE_MAX,
        startPage + OCR_TEXT_LAYER_SCAN_LIMIT - 1,
        numPages,
      );
      for (let n = startPage; n <= end; n++) await readTextLayer(n);
    }
    let selected = selectEmptyPagesInWindow(rows, args);
    if (selected.length < OCR_EMPTY_PAGE_LIMIT) {
      const scanEnd = refillLookbehindScanEnd(startPage, numPages);
      for (let n = 1; n <= scanEnd; n++) await readTextLayer(n);
      selected = selectEmptyPagesInWindow(rows, args);
    }
    const out: PageText[] = [];
    for (const row of selected) {
      try {
        const canvas = await renderPdfPageToCanvas(
          pdf,
          row.page - 1,
          OCR_RENDER_CSS_WIDTH,
        );
        const recognized = await worker.recognize(await canvasToBlob(canvas));
        const text = capOcrPageText(
          typeof recognized.data.text === "string" ? recognized.data.text : "",
        );
        if (text) out.push({ page: row.page, text });
      } catch (err) {
        console.warn(`PDF scan OCR skipped page ${row.page}`, err);
      }
    }
    return out.length > 0 ? out : undefined;
  } finally {
    await pdf.cleanup();
  }
}
