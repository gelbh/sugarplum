import JSZip from "jszip";

/**
 * Characters read per generation pass.
 * ponytail: stops adding slides at the cap instead of rejecting the file.
 * A later job passes startSlide to read the rest.
 */
export const PPTX_EXTRACT_MAX_CHARS = 600_000;
export const PPTX_EXTRACT_MAX_SLIDES = 120;

const SLIDE_PATH_RE = /^ppt\/slides\/slide\d+\.xml$/i;
const TEXT_NODE_RE = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;

export type PptxSlideText = { page: number; text: string };

export type PptxWindow = {
  pages: PptxSlideText[];
  totalPages: number;
  pageStart: number;
  pageEnd: number;
};

/**
 * Extract one slide window. Does not throw when the deck is longer than the window.
 * `page` is the 1-based slide index.
 */
export async function extractPptxSlides(
  data: ArrayBuffer,
  opts?: { startSlide?: number; maxChars?: number; maxSlides?: number },
): Promise<PptxWindow> {
  const maxChars = opts?.maxChars ?? PPTX_EXTRACT_MAX_CHARS;
  const maxSlides = opts?.maxSlides ?? PPTX_EXTRACT_MAX_SLIDES;
  const zip = await JSZip.loadAsync(data);
  const slideNames = Object.keys(zip.files)
    .filter((name) => SLIDE_PATH_RE.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const totalPages = slideNames.length;
  if (totalPages < 1) {
    return { pages: [], totalPages: 0, pageStart: 1, pageEnd: 0 };
  }
  const pageStart = Math.min(Math.max(1, opts?.startSlide ?? 1), totalPages);
  const pages: PptxSlideText[] = [];
  let chars = 0;
  for (let i = pageStart - 1; i < slideNames.length; i++) {
    if (pages.length >= maxSlides) break;
    if (chars >= maxChars && pages.length > 0) break;
    const name = slideNames[i]!;
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("string");
    const texts: string[] = [];
    TEXT_NODE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TEXT_NODE_RE.exec(xml)) !== null) {
      const t = match[1]?.trim();
      if (t) texts.push(t);
    }
    const text = texts.join(" ").trim();
    pages.push({ page: i + 1, text });
    chars += text.length;
  }
  const last = pages.at(-1)?.page ?? pageStart;
  return { pages, totalPages, pageStart, pageEnd: last };
}

/** Card regen still refuses a full-file read above the old char cap. */
const REGEN_MAX_CHARS = 200_000;

/**
 * Plain text for single-card regen.
 * A deck that does not fit in the old char cap throws, so regen uses the card excerpt.
 */
export async function extractPptxText(data: ArrayBuffer): Promise<string> {
  const extracted = await extractPptxSlides(data, {
    startSlide: 1,
    maxChars: REGEN_MAX_CHARS + 1,
    maxSlides: Number.MAX_SAFE_INTEGER,
  });
  const trimmed = extracted.pages
    .map((slide) => slide.text)
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (!trimmed) {
    throw new Error(
      "PPTX text extraction returned no text. Paste slide notes or OCR text instead.",
    );
  }
  if (extracted.pageEnd < extracted.totalPages || trimmed.length > REGEN_MAX_CHARS) {
    throw new Error(
      `PPTX text exceeds ${REGEN_MAX_CHARS} characters. Split the file or paste a shorter excerpt.`,
    );
  }
  return trimmed;
}
