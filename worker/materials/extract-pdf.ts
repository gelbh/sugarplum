import { extractText, getDocumentProxy } from "unpdf";

/** ponytail: O(pages) full extract; raise page/char caps or stream per-page if large lecture decks blow CPU/memory on Workers. */
export const PDF_EXTRACT_MAX_PAGES = 50;
export const PDF_EXTRACT_MAX_CHARS = 200_000;

/**
 * Extract plain text from a PDF ArrayBuffer for generation.
 * Throws when the PDF has no usable text (scanned/empty) or exceeds caps.
 */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  if (pdf.numPages > PDF_EXTRACT_MAX_PAGES) {
    throw new Error(
      `PDF has ${pdf.numPages} pages (max ${PDF_EXTRACT_MAX_PAGES}). Split the file or paste OCR text.`,
    );
  }

  const { text } = await extractText(pdf, { mergePages: true });
  const trimmed = String(text).trim();
  if (!trimmed) {
    throw new Error(
      "PDF text extraction returned no text (scanned image?). Paste OCR text instead.",
    );
  }

  if (trimmed.length > PDF_EXTRACT_MAX_CHARS) {
    throw new Error(
      `PDF text exceeds ${PDF_EXTRACT_MAX_CHARS} characters. Split the file or paste a shorter excerpt.`,
    );
  }
  return trimmed;
}
