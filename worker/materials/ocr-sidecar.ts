import type { Env } from "../env";
import { extractPdfText, REGEN_MAX_CHARS } from "./extract-pdf";

export const OCR_PAGE_LIMIT = 8;
export const OCR_PAGE_CHAR_CAP = 8_000;
export const OCR_PAGE_NUMBER_MAX = 2000;
/** Same role as client OCR_TEXT_LAYER_SCAN_LIMIT: refill window length. */
const OCR_REFILL_WINDOW_SPAN = 120;

export type OcrPageText = { page: number; text: string };

export type OcrSidecar = { pages: OcrPageText[]; unstudiedPages?: number[] };

export function ocrRefillWindow(
  startPage: number,
): { start: number; end: number } | null {
  if (
    !Number.isInteger(startPage) ||
    startPage < 1 ||
    startPage > OCR_PAGE_NUMBER_MAX
  ) {
    return null;
  }
  return {
    start: startPage,
    end: Math.min(
      OCR_PAGE_NUMBER_MAX,
      startPage + OCR_REFILL_WINDOW_SPAN - 1,
    ),
  };
}

export function ocrSidecarKey(deckId: string, materialId: string): string {
  return `materials/${deckId}/ocr/${materialId}.json`;
}

function parseOcrPageList(
  raw: unknown,
  maxCount: number,
  onDuplicate: "reject" | "drop",
): OcrPageText[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > maxCount) {
    throw new Error("Invalid ocrPages");
  }
  const pages: OcrPageText[] = [];
  const seenPages = new Set<number>();
  for (const item of raw) {
    if (!item || typeof item !== "object") throw new Error("Invalid ocrPages");
    const page = (item as { page?: unknown }).page;
    const text = (item as { text?: unknown }).text;
    if (
      typeof page !== "number" ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > OCR_PAGE_NUMBER_MAX
    ) {
      throw new Error("Invalid ocrPages");
    }
    if (seenPages.has(page)) {
      if (onDuplicate === "reject") throw new Error("Invalid ocrPages");
      continue;
    }
    seenPages.add(page);
    if (typeof text !== "string" || text.length > OCR_PAGE_CHAR_CAP) {
      throw new Error("Invalid ocrPages");
    }
    const trimmed = text.trim();
    if (!trimmed) continue;
    pages.push({ page, text: trimmed });
  }
  return pages.length > 0 ? pages : undefined;
}

export function parseOcrPages(raw: unknown): OcrPageText[] | undefined {
  return parseOcrPageList(raw, OCR_PAGE_LIMIT, "reject");
}

export function parseStoredOcrPages(raw: unknown): OcrPageText[] | undefined {
  return parseOcrPageList(raw, OCR_PAGE_NUMBER_MAX, "drop");
}

function parseUnstudiedPages(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const pages = new Set<number>();
  for (const item of raw) {
    if (
      typeof item !== "number" ||
      !Number.isInteger(item) ||
      item < 1 ||
      item > OCR_PAGE_NUMBER_MAX
    ) {
      continue;
    }
    pages.add(item);
  }
  if (pages.size === 0) return undefined;
  return [...pages].sort((a, b) => a - b);
}

export function mergeOcrPages(
  existing: readonly OcrPageText[],
  incoming: readonly OcrPageText[],
  window: { start: number; end: number },
): OcrPageText[] {
  const byPage = new Map(existing.map((page) => [page.page, page]));
  for (const page of incoming) {
    if (page.page < window.start || page.page > window.end) {
      throw new Error("Invalid ocrPages");
    }
    if (byPage.has(page.page)) continue;
    byPage.set(page.page, page);
  }
  return [...byPage.values()].sort((a, b) => a.page - b.page);
}

export function applyOcrSidecar<T extends { page: number; text: string }>(
  pages: readonly T[],
  sidecar: OcrSidecar | null,
): T[] {
  if (!sidecar) return [...pages];
  const byPage = new Map(sidecar.pages.map((page) => [page.page, page.text]));
  return pages.map((page) => {
    if (page.text.trim()) return page;
    const text = byPage.get(page.page)?.trim();
    if (!text) return page;
    return { ...page, text };
  });
}

export function orphanedSidecarPages(args: {
  pages: readonly {
    page: number;
    textLayer: string;
    sidecarText?: string;
  }[];
  pickedPages: readonly number[];
  nextPage: number;
}): number[] {
  const picked = new Set(args.pickedPages);
  const orphaned = new Set<number>();
  for (const page of args.pages) {
    if (page.page >= args.nextPage) continue;
    if (picked.has(page.page)) continue;
    if (page.textLayer.trim()) continue;
    if (!(page.sidecarText ?? "").trim()) continue;
    orphaned.add(page.page);
  }
  return [...orphaned].sort((a, b) => a - b);
}

export function nextUnstudiedPages(args: {
  previous: readonly number[];
  pickedPages: readonly number[];
  orphanPages: readonly number[];
}): number[] {
  const picked = new Set(args.pickedPages);
  const pages = new Set<number>();
  for (const page of args.previous) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > OCR_PAGE_NUMBER_MAX ||
      picked.has(page)
    ) {
      continue;
    }
    pages.add(page);
  }
  for (const page of args.orphanPages) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > OCR_PAGE_NUMBER_MAX ||
      picked.has(page)
    ) {
      continue;
    }
    pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

export function sidecarPlainText(sidecar: OcrSidecar | null): string {
  if (!sidecar) return "";
  return sidecar.pages
    .slice()
    .sort((a, b) => a.page - b.page)
    .map((page) => page.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function isPdfNoTextError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.message.startsWith("PDF text extraction returned no text")
  );
}

export async function readOcrSidecar(
  env: Env,
  deckId: string,
  materialId: string,
): Promise<OcrSidecar | null> {
  const obj = await env.MATERIALS.get(ocrSidecarKey(deckId, materialId));
  if (!obj) return null;
  try {
    const parsed: unknown = JSON.parse(await obj.text());
    const pages = parseStoredOcrPages(
      parsed && typeof parsed === "object" && "pages" in parsed
        ? (parsed as { pages?: unknown }).pages
        : undefined,
    );
    if (!pages) return null;
    const unstudiedPages = parseUnstudiedPages(
      parsed && typeof parsed === "object" && "unstudiedPages" in parsed
        ? (parsed as { unstudiedPages?: unknown }).unstudiedPages
        : undefined,
    );
    return unstudiedPages ? { pages, unstudiedPages } : { pages };
  } catch {
    return null;
  }
}

export async function writeOcrSidecar(
  env: Env,
  deckId: string,
  materialId: string,
  pages: readonly OcrPageText[],
  unstudiedPages?: readonly number[],
): Promise<void> {
  const body: OcrSidecar = { pages: [...pages] };
  if (unstudiedPages && unstudiedPages.length > 0) {
    body.unstudiedPages = [...unstudiedPages];
  }
  await env.MATERIALS.put(
    ocrSidecarKey(deckId, materialId),
    JSON.stringify(body),
    { httpMetadata: { contentType: "application/json" } },
  );
}

/** Regen stays on extractPdfText. The no-text error falls back to the sidecar. */
export async function pdfTextOrOcrSidecar(
  bytes: ArrayBuffer,
  readSidecar: () => Promise<OcrSidecar | null>,
): Promise<string> {
  try {
    return (await extractPdfText(bytes)).trim();
  } catch (err) {
    if (!isPdfNoTextError(err)) throw err;
    let sidecar: OcrSidecar | null = null;
    try {
      sidecar = await readSidecar();
    } catch {
      throw err;
    }
    const text = sidecarPlainText(sidecar);
    if (text.length > REGEN_MAX_CHARS) {
      throw new Error(
        `PDF text exceeds ${REGEN_MAX_CHARS} characters. Split the file or paste a shorter excerpt.`,
      );
    }
    if (!text) throw err;
    return text;
  }
}
