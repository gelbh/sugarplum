import { localEngine } from "@embedpdf/engine/portable";
import type { LocalEngine } from "@embedpdf/engine/portable";

/** Portable engine: Vite's default worker URL fails to boot. */
const engine: LocalEngine = localEngine();

export function getEmbedPdfEngine(): LocalEngine {
  return engine;
}

export type EmbedPdfDocument = Awaited<
  ReturnType<LocalEngine["open"]>
>;

export type EmbedPdfPageLayout = Awaited<
  ReturnType<EmbedPdfDocument["pages"]["list"]>
>["pages"][number];

/** Copy bytes before open: browser transfers ArrayBuffer into the worker. */
export function copyPdfBytes(
  data: ArrayBuffer | Uint8Array,
): Uint8Array {
  if (data instanceof Uint8Array) {
    const out = new Uint8Array(data.byteLength);
    out.set(data);
    return out;
  }
  return new Uint8Array(data.slice(0));
}

export async function openPdfDocument(
  data: ArrayBuffer | Uint8Array,
): Promise<EmbedPdfDocument> {
  return getEmbedPdfEngine().open({
    kind: "bytes",
    bytes: copyPdfBytes(data),
  });
}

export async function listPdfPages(
  doc: EmbedPdfDocument,
): Promise<{ pageCount: number; pages: EmbedPdfPageLayout[] }> {
  const snap = await doc.pages.list();
  return { pageCount: snap.pageCount, pages: snap.pages };
}

/** 1-based page number → layout (display index + 1). */
export function pageLayoutForNumber(
  pages: readonly EmbedPdfPageLayout[],
  pageNumber: number,
): EmbedPdfPageLayout | undefined {
  return pages.find((p) => p.index + 1 === pageNumber);
}

export async function pagePlainText(
  doc: EmbedPdfDocument,
  page: EmbedPdfPageLayout,
): Promise<string> {
  const snap = await doc.page(page.ref).text.get();
  return typeof snap.text === "string" ? snap.text : "";
}

function rasterToCanvas(
  raster: {
    width: number;
    height: number;
    stride: number;
    data: ArrayBuffer;
  },
  cssBox?: { width: number; height: number },
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const cssW = cssBox?.width ?? raster.width;
  const cssH = cssBox?.height ?? raster.height;
  canvas.width = raster.width;
  canvas.height = raster.height;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
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

  const rowBytes = raster.width * 4;
  const src = new Uint8Array(raster.data);
  const imageData = new ImageData(raster.width, raster.height);
  if (raster.stride === rowBytes) {
    imageData.data.set(new Uint8ClampedArray(raster.data));
  } else {
    for (let y = 0; y < raster.height; y++) {
      const start = y * raster.stride;
      imageData.data.set(
        src.subarray(start, start + rowBytes),
        y * rowBytes,
      );
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Render a page to canvas at a CSS width (DPR-aware), matching prior pdfjs helper.
 */
export async function renderPageToCanvas(
  doc: EmbedPdfDocument,
  page: EmbedPdfPageLayout,
  targetCssWidth: number,
): Promise<HTMLCanvasElement> {
  const dpr =
    typeof devicePixelRatio === "number" && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  const pixelWidth = Math.max(1, Math.floor(targetCssWidth * dpr));
  const raster = await doc.page(page.ref).render.raw({
    viewport: { kind: "width", width: pixelWidth },
    includeAnnotations: false,
    includeFormFields: false,
    background: "white",
  });
  const cssH = Math.max(
    1,
    Math.round((raster.height / Math.max(raster.width, 1)) * targetCssWidth),
  );
  return rasterToCanvas(raster, {
    width: Math.floor(targetCssWidth),
    height: cssH,
  });
}

/** Render at an absolute pixel scale (PDF points × scale). */
export async function renderPageToCanvasAtScale(
  doc: EmbedPdfDocument,
  page: EmbedPdfPageLayout,
  scale: number,
): Promise<HTMLCanvasElement> {
  const raster = await doc.page(page.ref).render.raw({
    viewport: { kind: "scale", scale },
    includeAnnotations: false,
    includeFormFields: false,
    background: "white",
  });
  return rasterToCanvas(raster);
}
