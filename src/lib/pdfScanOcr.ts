import { createWorker, OEM } from "tesseract.js";
import { loadPdfDocument, renderPdfPageToCanvas } from "./pdfPageRender";

/** Match the worker sidecar cap. Text-layer scan stays at the 120-page job window. */
export const OCR_EMPTY_PAGE_LIMIT = 8;
export const OCR_TEXT_LAYER_SCAN_LIMIT = 120;
export const OCR_PAGE_CHAR_CAP = 8_000;

const OCR_WORKER_PATH = "/ocr/worker.min.js";
const OCR_CORE_PATH = "/ocr/core";
const OCR_LANG_PATH = "/ocr";
const OCR_RENDER_CSS_WIDTH = 1000;

export type PageText = { page: number; text: string };

type ScanWorker = Awaited<ReturnType<typeof createWorker>>;

let scanWorker: ScanWorker | null = null;
let scanLoad: Promise<ScanWorker> | null = null;

/**
 * First 120 pages, in page order. At most 8 with an empty text layer.
 * Pages that already have text are skipped.
 */
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

/**
 * OCR up to 8 pages whose text layer is empty.
 * Returns undefined when the OCR worker fails to load, so the upload can continue.
 */
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
