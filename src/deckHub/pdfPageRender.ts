import { canvasSourceScale } from "../materials/kernel";

/** Match server generate/figure crop limit (worker/materials/limits.ts). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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
