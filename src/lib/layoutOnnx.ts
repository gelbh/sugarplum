import { type PageBox, filterFigureBoxes } from "./figureGeometry";

export type LayoutLoadResult =
  | { ok: true }
  | { ok: false; reason: string };

export type LabelsConfig = {
  labels: string[];
  size: [number, number];
  threshold: number;
};

export type LetterboxMeta = {
  scale: number;
  padX: number;
  padY: number;
  srcW: number;
  srcH: number;
  cssW: number;
  cssH: number;
};

export type ParsedDetection = {
  classId: number;
  label: string;
  score: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/**
 * ONNX is ~32MB (above Cloudflare static asset 25 MiB). Load from pinned HF
 * revision; labels stay first-party under /models/.
 */
const HF_LAYOUT_REV = "361fe8f94b5bbd2fe83d1cf3eb4b78203ba934b5";
const MODEL_URL = `https://huggingface.co/Ralutet/PP-DocLayout-L-onnx-int8/resolve/${HF_LAYOUT_REV}/pp-doclayout-l.onnx`;
const LABELS_URL = "/models/labels.json";

/** Non-jsep wasm EP; Vite bundles its own wasm (no public/ort override). */
type OrtModule = typeof import("onnxruntime-web/wasm");
type OrtSession = import("onnxruntime-web/wasm").InferenceSession;

export type DetectFigureResult =
  | { ok: true; boxes: PageBox[] }
  | { ok: false; reason: string };

let ortMod: OrtModule | null = null;
let session: OrtSession | null = null;
let labelsConfig: LabelsConfig | null = null;
let loadPromise: Promise<LayoutLoadResult> | null = null;

/** Test-only: clear lazy session state. */
export function resetLayoutSessionForTests(): void {
  ortMod = null;
  session = null;
  labelsConfig = null;
  loadPromise = null;
}

/**
 * Letterbox RGBA into NCHW float RGB /255 for PP-DocLayout-L (RT-DETR export).
 * Pad with 0; returns CHW of shape [3*target*target] (batch dim added by caller).
 */
export function letterboxRgbaToChw(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  target: number,
): {
  chw: Float32Array;
  scale: number;
  padX: number;
  padY: number;
  target: number;
} {
  const scale = Math.min(target / srcW, target / srcH);
  const newW = Math.max(1, Math.round(srcW * scale));
  const newH = Math.max(1, Math.round(srcH * scale));
  const padX = (target - newW) / 2;
  const padY = (target - newH) / 2;
  const plane = target * target;
  const chw = new Float32Array(3 * plane);

  for (let y = 0; y < newH; y++) {
    const srcY = Math.min(srcH - 1, Math.floor(y / scale));
    for (let x = 0; x < newW; x++) {
      const srcX = Math.min(srcW - 1, Math.floor(x / scale));
      const si = (srcY * srcW + srcX) * 4;
      const dx = Math.floor(x + padX);
      const dy = Math.floor(y + padY);
      if (dx < 0 || dy < 0 || dx >= target || dy >= target) continue;
      const di = dy * target + dx;
      chw[di] = rgba[si]! / 255;
      chw[plane + di] = rgba[si + 1]! / 255;
      chw[2 * plane + di] = rgba[si + 2]! / 255;
    }
  }

  return { chw, scale, padX, padY, target };
}

/** Map a 640-space xyxy box (identity im_shape/scale_factor) into CSS page pixels. */
export function mapLetterboxBoxToCss(
  box: { x1: number; y1: number; x2: number; y2: number },
  meta: LetterboxMeta,
): { x: number; y: number; w: number; h: number } {
  const bx1 = (box.x1 - meta.padX) / meta.scale;
  const by1 = (box.y1 - meta.padY) / meta.scale;
  const bx2 = (box.x2 - meta.padX) / meta.scale;
  const by2 = (box.y2 - meta.padY) / meta.scale;
  const sx = meta.cssW / meta.srcW;
  const sy = meta.cssH / meta.srcH;
  const x = bx1 * sx;
  const y = by1 * sy;
  return { x, y, w: (bx2 - bx1) * sx, h: (by2 - by1) * sy };
}

/**
 * Decode PP-DocLayout-L ONNX output rows: [class_id, score, x1, y1, x2, y2].
 * Confirmed via ORT inspect of Ralutet/PP-DocLayout-L-onnx-int8 (fetch_name_0).
 */
export function parseLayoutDetections(
  data: Float32Array | ArrayLike<number>,
  count: number,
  labels: string[],
  threshold: number,
): ParsedDetection[] {
  const out: ParsedDetection[] = [];
  const n = Math.min(count, Math.floor(data.length / 6));
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    const classId = Math.round(Number(data[o]));
    const score = Number(data[o + 1]);
    if (!(score >= threshold)) continue;
    const label = labels[classId];
    if (!label) continue;
    out.push({
      classId,
      label,
      score,
      x1: Number(data[o + 2]),
      y1: Number(data[o + 3]),
      x2: Number(data[o + 4]),
      y2: Number(data[o + 5]),
    });
  }
  return out;
}

function reasonOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

export async function ensureLayoutSession(): Promise<LayoutLoadResult> {
  if (session && labelsConfig) return { ok: true };
  if (loadPromise) return loadPromise;

  loadPromise = (async (): Promise<LayoutLoadResult> => {
    try {
      const ort = await import("onnxruntime-web/wasm");
      ortMod = ort;

      const labelsRes = await fetch(LABELS_URL);
      if (!labelsRes.ok) {
        throw new Error(`labels fetch HTTP ${labelsRes.status}`);
      }
      const labelsJson = (await labelsRes.json()) as LabelsConfig;
      if (
        !Array.isArray(labelsJson.labels) ||
        !Array.isArray(labelsJson.size) ||
        typeof labelsJson.threshold !== "number"
      ) {
        throw new Error("labels.json missing labels/size/threshold");
      }
      labelsConfig = labelsJson;

      session = await ort.InferenceSession.create(MODEL_URL);
      return { ok: true };
    } catch (err) {
      session = null;
      labelsConfig = null;
      ortMod = null;
      loadPromise = null;
      return { ok: false, reason: reasonOf(err) };
    }
  })();

  return loadPromise;
}

/** Run on a rendered page canvas; empty vs failure are distinct. */
export async function detectFigureBoxesOnCanvas(
  canvas: HTMLCanvasElement,
  pageIndex: number,
): Promise<DetectFigureResult> {
  try {
    const loaded = await ensureLayoutSession();
    if (!loaded.ok) {
      return { ok: false, reason: loaded.reason };
    }
    if (!session || !labelsConfig || !ortMod) {
      return { ok: false, reason: "layout session not ready" };
    }

    const srcW = canvas.width;
    const srcH = canvas.height;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (srcW <= 0 || srcH <= 0 || cssW <= 0 || cssH <= 0) {
      return { ok: false, reason: "page canvas has no size" };
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { ok: false, reason: "2d context unavailable" };
    }
    const { data: rgba } = ctx.getImageData(0, 0, srcW, srcH);

    const target = labelsConfig.size[0] ?? 640;
    const { chw, scale, padX, padY } = letterboxRgbaToChw(
      rgba,
      srcW,
      srcH,
      target,
    );

    const ort = ortMod;
    const image = new ort.Tensor("float32", chw, [1, 3, target, target]);
    // Identity meta → boxes in letterboxed target space (see module note above).
    const imShape = new ort.Tensor(
      "float32",
      Float32Array.from([target, target]),
      [1, 2],
    );
    const scaleFactor = new ort.Tensor(
      "float32",
      Float32Array.from([1, 1]),
      [1, 2],
    );

    const feeds = {
      image,
      im_shape: imShape,
      scale_factor: scaleFactor,
    };
    const results = await session.run(feeds);

    const out0Name = session.outputNames[0];
    const out1Name = session.outputNames[1];
    if (!out0Name) {
      return { ok: false, reason: "model has no detection output" };
    }
    const out0 = results[out0Name];
    const out1 = out1Name ? results[out1Name] : undefined;
    if (!out0) {
      return { ok: false, reason: "missing detection tensor" };
    }

    const count =
      out1 && out1.data.length > 0 ? Number(out1.data[0]) : out0.dims[0] ?? 0;
    const parsed = parseLayoutDetections(
      out0.data as Float32Array,
      count,
      labelsConfig.labels,
      labelsConfig.threshold,
    );

    const meta: LetterboxMeta = {
      scale,
      padX,
      padY,
      srcW,
      srcH,
      cssW,
      cssH,
    };

    const boxes: PageBox[] = parsed.map((det) => {
      const css = mapLetterboxBoxToCss(det, meta);
      return {
        pageIndex,
        x: css.x,
        y: css.y,
        w: css.w,
        h: css.h,
        score: det.score,
        label: det.label,
      };
    });

    return { ok: true, boxes: filterFigureBoxes(boxes, cssW, cssH) };
  } catch (err) {
    return { ok: false, reason: reasonOf(err) };
  }
}
