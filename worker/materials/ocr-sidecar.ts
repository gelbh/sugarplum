import type { Env } from "../env";
import { extractPdfText } from "./extract-pdf";

export const OCR_PAGE_LIMIT = 8;
export const OCR_PAGE_CHAR_CAP = 8_000;
export const OCR_PAGE_NUMBER_MAX = 120;

export type OcrPageText = { page: number; text: string };

export type OcrSidecar = { pages: OcrPageText[] };

export function ocrSidecarKey(deckId: string, materialId: string): string {
  return `materials/${deckId}/ocr/${materialId}.json`;
}

export function parseOcrPages(raw: unknown): OcrPageText[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > OCR_PAGE_LIMIT) {
    throw new Error("Invalid ocrPages");
  }
  const pages: OcrPageText[] = [];
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
    if (typeof text !== "string" || text.length > OCR_PAGE_CHAR_CAP) {
      throw new Error("Invalid ocrPages");
    }
    const trimmed = text.trim();
    if (!trimmed) continue;
    pages.push({ page, text: trimmed });
  }
  return pages.length > 0 ? pages : undefined;
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
    const pages = parseOcrPages(
      parsed && typeof parsed === "object" && "pages" in parsed
        ? (parsed as { pages?: unknown }).pages
        : undefined,
    );
    return pages ? { pages } : null;
  } catch {
    return null;
  }
}

export async function writeOcrSidecar(
  env: Env,
  deckId: string,
  materialId: string,
  pages: readonly OcrPageText[],
): Promise<void> {
  await env.MATERIALS.put(
    ocrSidecarKey(deckId, materialId),
    JSON.stringify({ pages }),
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
    if (!text) throw err;
    return text;
  }
}
