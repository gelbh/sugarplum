import JSZip from "jszip";

/**
 * Client copy of worker/materials/extract-pptx slide scrape.
 * App tsconfig cannot import worker/; keep algorithms aligned for Notes rescue.
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

/** Does not throw when the deck is longer than this window. `page` is the 1-based slide index. */
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
