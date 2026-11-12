import { createWorker, OEM } from "tesseract.js";
import {
  listPdfPages,
  openPdfDocument,
  pageLayoutForNumber,
  pagePlainText,
  renderPageToCanvas,
  type EmbedPdfDocument,
  type EmbedPdfPageLayout,
} from "./embedPdfEngine";

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

async function readTextLayerPage(
  doc: EmbedPdfDocument,
  pages: readonly EmbedPdfPageLayout[],
  pageNumber: number,
): Promise<PageText | null> {
  const layout = pageLayoutForNumber(pages, pageNumber);
  if (!layout) return null;
  const text = await pagePlainText(doc, layout);
  return { page: pageNumber, text };
}

async function ocrEmptyRow(
  worker: ScanWorker,
  doc: EmbedPdfDocument,
  pages: readonly EmbedPdfPageLayout[],
  row: PageText,
): Promise<PageText | null> {
  const layout = pageLayoutForNumber(pages, row.page);
  if (!layout) return null;
  const canvas = await renderPageToCanvas(
    doc,
    layout,
    OCR_RENDER_CSS_WIDTH,
  );
  const recognized = await worker.recognize(await canvasToBlob(canvas));
  const text = capOcrPageText(
    typeof recognized.data.text === "string" ? recognized.data.text : "",
  );
  return text ? { page: row.page, text } : null;
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

  const doc = await openPdfDocument(data);
  try {
    const { pageCount, pages } = await listPdfPages(doc);
    const limit = Math.min(pageCount, OCR_TEXT_LAYER_SCAN_LIMIT);
    const rows: PageText[] = [];
    for (let n = 1; n <= limit; n++) {
      const row = await readTextLayerPage(doc, pages, n);
      if (row) rows.push(row);
    }
    const out: PageText[] = [];
    for (const row of selectEmptyPages(rows)) {
      try {
        const hit = await ocrEmptyRow(worker, doc, pages, row);
        if (hit) out.push(hit);
      } catch (err) {
        console.warn(`PDF scan OCR skipped page ${row.page}`, err);
      }
    }
    return out.length > 0 ? out : undefined;
  } finally {
    await doc.close();
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

  const doc = await openPdfDocument(data);
  try {
    const startPage = args.startPage;
    if (!Number.isInteger(startPage) || startPage < 1) return undefined;
    const { pageCount, pages } = await listPdfPages(doc);
    const rows: PageText[] = [];
    const readTextLayer = async (pageNumber: number): Promise<void> => {
      const row = await readTextLayerPage(doc, pages, pageNumber);
      if (row) rows.push(row);
    };
    if (startPage <= OCR_REFILL_PAGE_MAX && startPage <= pageCount) {
      const end = Math.min(
        OCR_REFILL_PAGE_MAX,
        startPage + OCR_TEXT_LAYER_SCAN_LIMIT - 1,
        pageCount,
      );
      for (let n = startPage; n <= end; n++) await readTextLayer(n);
    }
    let selected = selectEmptyPagesInWindow(rows, args);
    if (selected.length < OCR_EMPTY_PAGE_LIMIT) {
      const scanEnd = refillLookbehindScanEnd(startPage, pageCount);
      for (let n = 1; n <= scanEnd; n++) await readTextLayer(n);
      selected = selectEmptyPagesInWindow(rows, args);
    }
    const out: PageText[] = [];
    for (const row of selected) {
      try {
        const hit = await ocrEmptyRow(worker, doc, pages, row);
        if (hit) out.push(hit);
      } catch (err) {
        console.warn(`PDF scan OCR skipped page ${row.page}`, err);
      }
    }
    return out.length > 0 ? out : undefined;
  } finally {
    await doc.close();
  }
}
