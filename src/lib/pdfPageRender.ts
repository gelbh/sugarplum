import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { canvasSourceScale } from "./figureGeometry";

/** Match server generate/figure crop limit (worker/materials/limits.ts). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function cssRectToSourceRect(
  css: { x: number; y: number; w: number; h: number },
  scale: number,
): { sx: number; sy: number; sw: number; sh: number } {
  return {
    sx: css.x * scale,
    sy: css.y * scale,
    sw: css.w * scale,
    sh: css.h * scale,
  };
}

/** DOM-free guard for crop PNG size (also used by cropCanvasToPngFile). */
export function assertWithinImageByteLimit(byteSize: number): void {
  if (byteSize > MAX_IMAGE_BYTES) {
    throw new Error(
      `Figure crop exceeds ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit`,
    );
  }
}

export async function loadPdfDocument(
  data: ArrayBuffer,
): Promise<PDFDocumentProxy> {
  const task = getDocument({ data, useSystemFonts: true });
  return task.promise;
}

export async function renderPdfPageToCanvas(
  pdf: PDFDocumentProxy,
  pageIndex: number,
  targetCssWidth: number,
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageIndex + 1);
  const baseViewport = page.getViewport({ scale: 1 });
  const cssScale = targetCssWidth / baseViewport.width;
  const cssViewport = page.getViewport({ scale: cssScale });
  const outputScale =
    typeof devicePixelRatio === "number" && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  const viewport = page.getViewport({ scale: cssScale * outputScale });

  const canvas = document.createElement("canvas");
  const cssW = Math.floor(cssViewport.width);
  const cssH = Math.floor(cssViewport.height);
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  // Off-DOM canvases report clientWidth 0; pin CSS box for canvasSourceScale.
  Object.defineProperty(canvas, "clientWidth", {
    configurable: true,
    get: () => cssW,
  });
  Object.defineProperty(canvas, "clientHeight", {
    configurable: true,
    get: () => cssH,
  });

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2d canvas context unavailable");
  }
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

/** Crop using CSS rect; source pixels use canvasSourceScale. */
export async function cropCanvasToPngFile(
  canvas: HTMLCanvasElement,
  cssBox: { x: number; y: number; w: number; h: number },
  filename: string,
): Promise<File> {
  const scale = canvasSourceScale(canvas);
  const { sx, sy, sw, sh } = cssRectToSourceRect(cssBox, scale);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw));
  out.height = Math.max(1, Math.round(sh));
  const ctx = out.getContext("2d");
  if (!ctx) {
    throw new Error("2d canvas context unavailable");
  }
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
      "image/png",
    );
  });
  assertWithinImageByteLimit(blob.size);
  return new File([blob], filename, { type: "image/png" });
}
