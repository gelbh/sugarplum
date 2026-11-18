import type { Env } from "../env";
import { extractPptxSlides } from "../materials/extract-pptx";
import {
  OCR_PAGE_CHAR_CAP,
  type OcrPageText,
  writeAtlasOcrSidecar,
} from "../materials/ocr-sidecar";

export type AtlasPptxPersistResult = {
  pages: OcrPageText[];
  totalPages: number;
};

/** Extract PPTX slides, cap page text for sidecar round-trip, write atlas OCR sidecar. */
export async function persistAtlasPptxSidecarFromBytes(
  env: Env,
  atlasId: string,
  materialId: string,
  bytes: ArrayBuffer,
): Promise<AtlasPptxPersistResult | null> {
  const extracted = await extractPptxSlides(bytes);
  const pages = extracted.pages.map((p) => ({
    page: p.page,
    text: p.text.slice(0, OCR_PAGE_CHAR_CAP),
  }));
  if (!pages.some((p) => p.text.trim())) {
    return { pages: [], totalPages: extracted.totalPages };
  }
  await writeAtlasOcrSidecar(env, atlasId, materialId, pages);
  return { pages, totalPages: extracted.totalPages };
}
