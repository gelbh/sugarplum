import { getDocumentProxy } from "unpdf";

/**
 * Pages read per generation pass.
 * ponytail: sequential getPage, not unpdf extractText (that fans out every page).
 * Raise the window if a lecture still needs a later range in the same job.
 * Upload may be 50MB; isolate safety still depends on sequential windows + image
 * pixel caps, not loading unbounded rasters.
 */
export const PDF_EXTRACT_MAX_PAGES = 120;
export const PDF_EXTRACT_MAX_CHARS = 600_000;

/** ~4 megapixels. Larger declared images are not decoded. */
const PDF_MAX_IMAGE_PIXELS = 4_000_000;

export type PdfPageText = { page: number; text: string };

export type PdfWindow = {
  pages: PdfPageText[];
  totalPages: number;
  pageStart: number;
  pageEnd: number;
};

type PdfTextItem = { str?: unknown; hasEOL?: boolean };

type PdfPage = {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  cleanup?: () => void | Promise<void>;
};

type PdfDoc = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy?: () => Promise<void>;
};

export function pdfWindowEnd(
  totalPages: number,
  startPage: number,
  maxPages: number = PDF_EXTRACT_MAX_PAGES,
): number {
  if (totalPages < 1) return 0;
  const start = Math.min(Math.max(1, startPage), totalPages);
  return Math.min(totalPages, start + maxPages - 1);
}

function pageText(items: PdfTextItem[]): string {
  return items
    .filter((item) => typeof item.str === "string")
    .map((item) => `${item.str}${item.hasEOL ? "\n" : ""}`)
    .join("")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Does not throw when the document is longer than this window. */
export async function extractPdfPages(
  data: ArrayBuffer,
  startPage: number = 1,
): Promise<PdfWindow> {
  const pdf = (await getDocumentProxy(new Uint8Array(data), {
    maxImageSize: PDF_MAX_IMAGE_PIXELS,
  })) as unknown as PdfDoc;
  try {
    const totalPages = pdf.numPages;
    if (totalPages < 1) {
      return { pages: [], totalPages: 0, pageStart: 1, pageEnd: 0 };
    }
    const pageStart = Math.min(Math.max(1, startPage), totalPages);
    const pageEnd = pdfWindowEnd(totalPages, pageStart);
    const pages: PdfPageText[] = [];
    let chars = 0;
    for (let n = pageStart; n <= pageEnd; n++) {
      if (chars >= PDF_EXTRACT_MAX_CHARS && pages.length > 0) break;
      const page = await pdf.getPage(n);
      try {
        const content = await page.getTextContent();
        const text = pageText(content.items);
        pages.push({ page: n, text });
        chars += text.length;
      } finally {
        await page.cleanup?.();
      }
    }
    const last = pages.at(-1)?.page ?? pageStart;
    return { pages, totalPages, pageStart, pageEnd: last };
  } finally {
    await pdf.destroy?.();
  }
}

/** Backfill/admin full-doc extract; hard caps avoid Worker OOM on huge PDFs. */
export const BACKFILL_PDF_MAX_PAGES = 200;
export const BACKFILL_PDF_MAX_CHARS = 800_000;

/** Every page's text layer up to backfill page/char caps. */
export async function extractAllPdfPageTexts(
  data: ArrayBuffer,
  opts?: { maxPages?: number; maxChars?: number },
): Promise<{ pages: PdfPageText[]; totalPages: number; truncated: boolean }> {
  const maxPages = opts?.maxPages ?? BACKFILL_PDF_MAX_PAGES;
  const maxChars = opts?.maxChars ?? BACKFILL_PDF_MAX_CHARS;
  const pdf = (await getDocumentProxy(new Uint8Array(data.slice(0)), {
    maxImageSize: PDF_MAX_IMAGE_PIXELS,
  })) as unknown as PdfDoc;
  try {
    const totalPages = pdf.numPages;
    if (totalPages < 1) return { pages: [], totalPages: 0, truncated: false };
    const pages: PdfPageText[] = [];
    let chars = 0;
    const pageEnd = Math.min(totalPages, maxPages);
    for (let n = 1; n <= pageEnd; n++) {
      if (chars >= maxChars && pages.length > 0) {
        return { pages, totalPages, truncated: true };
      }
      const page = await pdf.getPage(n);
      try {
        const content = await page.getTextContent();
        const text = pageText(content.items);
        pages.push({ page: n, text });
        chars += text.length;
      } finally {
        await page.cleanup?.();
      }
    }
    return {
      pages,
      totalPages,
      truncated: pageEnd < totalPages || chars >= maxChars,
    };
  } finally {
    await pdf.destroy?.();
  }
}

export async function extractPdfPageNumbers(
  data: ArrayBuffer,
  pageNumbers: readonly number[],
): Promise<PdfPageText[]> {
  const wanted = [
    ...new Set(
      pageNumbers.filter(
        (page) => Number.isInteger(page) && page >= 1,
      ),
    ),
  ].sort((a, b) => a - b);
  if (wanted.length === 0) return [];
  const pdf = (await getDocumentProxy(new Uint8Array(data.slice(0)), {
    maxImageSize: PDF_MAX_IMAGE_PIXELS,
  })) as unknown as PdfDoc;
  try {
    const totalPages = pdf.numPages;
    if (totalPages < 1) return [];
    const pages: PdfPageText[] = [];
    for (const n of wanted) {
      if (n > totalPages) continue;
      const page = await pdf.getPage(n);
      try {
        const content = await page.getTextContent();
        pages.push({ page: n, text: pageText(content.items) });
      } finally {
        await page.cleanup?.();
      }
    }
    return pages;
  } finally {
    await pdf.destroy?.();
  }
}

/** Card regen still refuses a full-file read above the pre-window caps. */
const REGEN_MAX_PAGES = 50;
export const REGEN_MAX_CHARS = 200_000;

/** Throws above the old caps so regen uses the card excerpt, not the opening window. */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdf = (await getDocumentProxy(new Uint8Array(data.slice(0)), {
    maxImageSize: PDF_MAX_IMAGE_PIXELS,
  })) as unknown as PdfDoc;
  const totalPages = pdf.numPages;
  await pdf.destroy?.();
  if (totalPages > REGEN_MAX_PAGES) {
    throw new Error(
      `PDF has ${totalPages} pages (max ${REGEN_MAX_PAGES}). Split the file or paste OCR text.`,
    );
  }
  const window = await extractPdfPages(data.slice(0), 1);
  const text = window.pages
    .map((page) => page.text)
    .join("\n\n")
    .trim();
  if (!text) {
    throw new Error(
      "PDF text extraction returned no text (scanned image?). Paste OCR text instead.",
    );
  }
  if (text.length > REGEN_MAX_CHARS || window.pageEnd < window.totalPages) {
    throw new Error(
      `PDF text exceeds ${REGEN_MAX_CHARS} characters. Split the file or paste a shorter excerpt.`,
    );
  }
  return text;
}
