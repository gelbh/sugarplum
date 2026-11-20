import { createWorker, OEM, PSM } from "tesseract.js";
import {
  mapOcrWordsToRegions,
  type MappedOcclusionRegion,
  type OcrWord,
} from "./occlusionOcrMap";

const OCR_WORKER_PATH = "/ocr/worker.min.js";
const OCR_CORE_PATH = "/ocr/core";
const OCR_LANG_PATH = "/ocr";

type OcrWorker = Awaited<ReturnType<typeof createWorker>>;

let worker: OcrWorker | null = null;
let loadPromise: Promise<OcrWorker> | null = null;
let sparseTextPsmApplied = false;

/** Test-only: clear lazy worker state (does not terminate WASM). */
export function resetOcrWorkerForTests(): void {
  worker = null;
  loadPromise = null;
  sparseTextPsmApplied = false;
}

function reasonOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

async function applySparseTextPsm(w: OcrWorker): Promise<void> {
  if (sparseTextPsmApplied) return;
  try {
    await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    sparseTextPsmApplied = true;
  } catch {
    // PSM is best-effort; default segmentation still runs.
  }
}

async function ensureOcrWorker(): Promise<OcrWorker> {
  if (worker) return worker;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const w = await createWorker("eng", OEM.LSTM_ONLY, {
        workerPath: OCR_WORKER_PATH,
        corePath: OCR_CORE_PATH,
        langPath: OCR_LANG_PATH,
      });
      await applySparseTextPsm(w);
      worker = w;
      return w;
    } catch (err) {
      loadPromise = null;
      worker = null;
      sparseTextPsmApplied = false;
      throw new Error(`OCR worker failed to load: ${reasonOf(err)}`);
    }
  })();

  return loadPromise;
}

/** Flatten tesseract blocks → paragraphs → lines → words (requires `{ blocks: true }`). */
export function flattenBlocksToWords(
  blocks: Array<{
    paragraphs?: Array<{
      lines?: Array<{
        words?: Array<{
          text: string;
          confidence: number;
          bbox: OcrWord["bbox"];
        }>;
      }>;
    }>;
  }> | null,
): OcrWord[] {
  if (!blocks?.length) return [];

  const words: OcrWord[] = [];
  for (const block of blocks) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const word of line.words ?? []) {
          if (!word.text?.trim()) continue;
          words.push({
            text: word.text,
            confidence: word.confidence,
            bbox: word.bbox,
          });
        }
      }
    }
  }
  return words;
}

export async function suggestOcclusionRegions(
  image: Blob | string,
  naturalWidth: number,
  naturalHeight: number,
): Promise<MappedOcclusionRegion[]> {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    throw new Error("OCR image has invalid natural dimensions");
  }

  let w: OcrWorker;
  try {
    w = await ensureOcrWorker();
  } catch (err) {
    throw err instanceof Error
      ? err
      : new Error(`OCR worker failed to load: ${reasonOf(err)}`);
  }

  try {
    const result = await w.recognize(image, {}, { blocks: true });
    const words = flattenBlocksToWords(result.data.blocks);
    return mapOcrWordsToRegions(words, naturalWidth, naturalHeight);
  } catch (err) {
    throw new Error(`OCR recognition failed: ${reasonOf(err)}`);
  }
}
