import JSZip from "jszip";

/** ponytail: full slide XML scan; stream/cap if huge lecture decks blow Worker memory. */
export const PPTX_EXTRACT_MAX_CHARS = 200_000;

const SLIDE_PATH_RE = /^ppt\/slides\/slide\d+\.xml$/i;
const TEXT_NODE_RE = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;

/**
 * Extract plain text from a PPTX (OOXML ZIP) ArrayBuffer for generation.
 * Throws when there is no usable text or the extract exceeds the char cap.
 */
export async function extractPptxText(data: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const slideNames = Object.keys(zip.files)
    .filter((name) => SLIDE_PATH_RE.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const parts: string[] = [];
  for (const name of slideNames) {
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
    if (texts.length > 0) {
      parts.push(texts.join(" "));
    }
  }

  const trimmed = parts.join("\n\n").trim();
  if (!trimmed) {
    throw new Error(
      "PPTX text extraction returned no text. Paste slide notes or OCR text instead.",
    );
  }
  if (trimmed.length > PPTX_EXTRACT_MAX_CHARS) {
    throw new Error(
      `PPTX text exceeds ${PPTX_EXTRACT_MAX_CHARS} characters. Split the file or paste a shorter excerpt.`,
    );
  }
  return trimmed;
}
