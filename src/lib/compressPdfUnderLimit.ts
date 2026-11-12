import {
  PDFDocument,
  PDFName,
  PDFRawStream,
  type PDFRef,
} from "pdf-lib";
import { fileSizeCapMb } from "./materialUploadLimits";
import { loadPdfDocument } from "./pdfPageRender";

export type CompressPdfOk = { ok: true; file: File };
export type CompressPdfErr = {
  ok: false;
  reason: "invalid_pdf" | "still_too_large" | "empty" | "failed";
  message: string;
};

const JPEG_QUALITIES = [0.85, 0.7, 0.55, 0.45] as const;
const RASTER_SCALES = [2, 1.5, 1.25, 1] as const;
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_CANVAS_SIDE = 8192;
const MAX_IMAGE_SIDE = 4096;

function resolveStem(
  source: File | ArrayBuffer,
  opts?: { nameStem?: string },
): string {
  if (opts?.nameStem) return opts.nameStem;
  if (source instanceof File) {
    return source.name.replace(/\.pdf$/i, "") || "document";
  }
  return "document";
}

async function toBytes(source: File | ArrayBuffer): Promise<Uint8Array> {
  if (source instanceof File) {
    return new Uint8Array(await source.arrayBuffer());
  }
  return new Uint8Array(source);
}

function stillTooLargeMessage(maxBytes: number): string {
  return `Still larger than ${fileSizeCapMb(maxBytes)}MB after compression. Export a smaller PDF externally and try again.`;
}

function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        void blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      },
      "image/jpeg",
      quality,
    );
  });
}

async function reencodeRasterToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
  maxSide: number = MAX_IMAGE_SIDE,
): Promise<Uint8Array | null> {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const out = await canvasToJpeg(canvas, quality);
  canvas.width = 0;
  canvas.height = 0;
  return out;
}

async function reencodeJpegBytes(
  jpeg: Uint8Array,
  quality: number,
): Promise<Uint8Array | null> {
  const blob = new Blob([jpeg.slice()], { type: "image/jpeg" });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  try {
    return await reencodeRasterToJpeg(
      bitmap,
      bitmap.width,
      bitmap.height,
      quality,
    );
  } finally {
    bitmap.close();
  }
}

function isSafeImageStream(stream: PDFRawStream): boolean {
  const dict = stream.dict;
  if (dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) return false;
  if (dict.has(PDFName.of("SMask"))) return false;
  if (dict.has(PDFName.of("Mask"))) return false;
  if (dict.has(PDFName.of("Decode"))) return false;
  if (dict.has(PDFName.of("ImageMask"))) return false;
  const filter = dict.get(PDFName.of("Filter"));
  if (filter === PDFName.of("DCTDecode")) return true;
  if (Array.isArray(filter)) {
    return filter.length === 1 && filter[0] === PDFName.of("DCTDecode");
  }
  return false;
}

async function stageInPlaceImages(
  bytes: Uint8Array,
  maxBytes: number,
  onProgress?: (label: string) => void,
): Promise<Uint8Array | null> {
  onProgress?.("Compressing images…");
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    return null;
  }

  let swapped = 0;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (!isSafeImageStream(obj)) continue;
    const original = obj.getContents();
    if (original.byteLength === 0) continue;

    let best: Uint8Array | null = null;
    for (const q of JPEG_QUALITIES) {
      const next = await reencodeJpegBytes(original, q);
      if (!next) continue;
      if (next.byteLength >= original.byteLength) continue;
      if (!best || next.byteLength < best.byteLength) best = next;
      if (best.byteLength < maxBytes * 0.5) break;
    }
    if (!best) continue;

    const width = obj.dict.lookup(PDFName.of("Width"));
    const height = obj.dict.lookup(PDFName.of("Height"));
    const wNum =
      width && "asNumber" in width && typeof width.asNumber === "function"
        ? width.asNumber()
        : undefined;
    const hNum =
      height && "asNumber" in height && typeof height.asNumber === "function"
        ? height.asNumber()
        : undefined;

    const newDict = doc.context.obj({
      Type: "XObject",
      Subtype: "Image",
      Width: wNum ?? 1,
      Height: hNum ?? 1,
      ColorSpace: "DeviceRGB",
      BitsPerComponent: 8,
      Filter: "DCTDecode",
      Length: best.byteLength,
    });
    doc.context.assign(ref as PDFRef, PDFRawStream.of(newDict, best));
    swapped += 1;
  }

  if (swapped === 0) return null;
  const saved = await doc.save({ useObjectStreams: true });
  if (saved.byteLength > maxBytes) return null;
  return saved;
}

function clampScaleForPage(widthPt: number, heightPt: number, scale: number): number {
  const w = widthPt * scale;
  const h = heightPt * scale;
  return Math.min(
    scale,
    MAX_CANVAS_SIDE / Math.max(widthPt, 1),
    MAX_CANVAS_SIDE / Math.max(heightPt, 1),
    Math.sqrt(MAX_CANVAS_PIXELS / Math.max(widthPt * heightPt, 1)),
    w > 0 && h > 0 ? scale : 1,
  );
}

async function stageRasterPage(
  bytes: Uint8Array,
  maxBytes: number,
  onProgress?: (label: string) => void,
): Promise<Uint8Array | null> {
  onProgress?.("Re-encoding page…");
  let pdf;
  try {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    pdf = await loadPdfDocument(copy);
  } catch {
    return null;
  }

  try {
    if (pdf.numPages < 1) return null;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });

    for (const scale of RASTER_SCALES) {
      const clamped = clampScaleForPage(base.width, base.height, scale);
      const viewport = page.getViewport({ scale: clamped });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        canvas.width = 0;
        canvas.height = 0;
        continue;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      try {
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      } catch {
        canvas.width = 0;
        canvas.height = 0;
        continue;
      }

      for (const q of JPEG_QUALITIES) {
        const jpeg = await canvasToJpeg(canvas, q);
        if (!jpeg) continue;
        const outDoc = await PDFDocument.create();
        const embedded = await outDoc.embedJpg(jpeg);
        const outPage = outDoc.addPage([base.width, base.height]);
        outPage.drawImage(embedded, {
          x: 0,
          y: 0,
          width: base.width,
          height: base.height,
        });
        const saved = await outDoc.save({ useObjectStreams: true });
        if (saved.byteLength <= maxBytes) {
          canvas.width = 0;
          canvas.height = 0;
          return saved;
        }
      }
      canvas.width = 0;
      canvas.height = 0;
    }
    return null;
  } finally {
    await pdf.cleanup();
  }
}

export async function compressPdfUnderLimit(
  source: File | ArrayBuffer,
  maxBytes: number,
  opts?: { nameStem?: string; onProgress?: (label: string) => void },
): Promise<CompressPdfOk | CompressPdfErr> {
  const inputSize =
    source instanceof File ? source.size : source.byteLength;
  let bytes: Uint8Array;
  try {
    bytes = await toBytes(source);
  } catch {
    return {
      ok: false,
      reason: "failed",
      message: "Could not read this PDF",
    };
  }

  let pageCount = 0;
  try {
    const probe = await PDFDocument.load(bytes, { ignoreEncryption: true });
    pageCount = probe.getPageCount();
  } catch {
    return {
      ok: false,
      reason: "invalid_pdf",
      message: "Could not read this PDF",
    };
  }

  if (pageCount === 0) {
    return {
      ok: false,
      reason: "empty",
      message: "This PDF has no pages",
    };
  }

  const stem = resolveStem(source, opts);
  const asFile = (out: Uint8Array) => {
    const copy = new Uint8Array(out.byteLength);
    copy.set(out);
    return new File([copy], `${stem}.pdf`, { type: "application/pdf" });
  };

  // Already under the cap: return a single-stem File (no (k/n) rename).
  if (bytes.byteLength <= maxBytes) {
    return { ok: true, file: asFile(bytes) };
  }

  try {
    const inPlace = await stageInPlaceImages(bytes, maxBytes, opts?.onProgress);
    const chosen =
      inPlace && inPlace.byteLength <= maxBytes
        ? inPlace
        : await stageRasterPage(bytes, maxBytes, opts?.onProgress);

    if (
      !chosen ||
      chosen.byteLength > maxBytes ||
      chosen.byteLength > inputSize
    ) {
      return {
        ok: false,
        reason: "still_too_large",
        message: stillTooLargeMessage(maxBytes),
      };
    }

    return { ok: true, file: asFile(chosen) };
  } catch {
    return {
      ok: false,
      reason: "failed",
      message: "Could not compress this PDF. Try compressing it externally.",
    };
  }
}
