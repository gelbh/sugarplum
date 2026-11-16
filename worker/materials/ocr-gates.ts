import { HTTPException } from "hono/http-exception";
import { loadMaterialWindowResume } from "../generation/study-windows";
import type { MaterialRow } from "./types";
import { FILE_READY } from "./upload";

export function assertReadyPdfForOcr(material: MaterialRow): string {
  if (
    material.kind !== "pdf" ||
    material.status !== FILE_READY ||
    !material.r2_key
  ) {
    throw new HTTPException(422, {
      message: "OCR refill is only for a ready PDF",
    });
  }
  return material.r2_key;
}

export async function ocrResumeStartPage(
  db: D1Database,
  materialId: string,
): Promise<number> {
  return (await loadMaterialWindowResume(db, materialId)).startPage;
}
