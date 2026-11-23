import { isGuest } from "../guest/session";
import type { SourceRole } from "../materials/kernel";
import {
  UploadError,
  uploadWithProgress,
} from "../progress/uploadWithProgress";
import {
  ocrEmptyPdfPages,
  ocrEmptyPdfPagesInWindow,
  type PageText,
} from "../materials/kernel";
import { api, ApiError, guestUnsupported } from "./core";
import type {
  CompleteMaterialResponse,
  FigureExtractMode,
  Material,
  PasteMaterialResponse,
  UploadUrlResponse,
} from "./types";

export const MAX_TOPIC_HINTS = 20;
export const MAX_TOPIC_HINT_CHARS = 300;

/** One non-empty line per hint; strips empties and soft-caps length/count. */
export function topicHintsFromLines(raw: string): string[] | undefined {
  return sanitizeTopicHints(raw.split("\n"));
}

export function sanitizeTopicHints(hints: string[]): string[] | undefined {
  const cleaned = hints
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(0, MAX_TOPIC_HINT_CHARS))
    .slice(0, MAX_TOPIC_HINTS);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function pasteMaterial(
  deckId: string,
  body: {
    text: string;
    filename?: string;
    topicHints?: string[];
    source_role?: SourceRole;
  },
) {
  if (isGuest()) guestUnsupported("generate cards from materials");
  return api<PasteMaterialResponse>(`/api/decks/${deckId}/materials/paste`, {
    method: "POST",
    json: body,
  });
}

export function patchMaterialSourceRole(
  materialId: string,
  source_role: SourceRole,
) {
  if (isGuest()) guestUnsupported("edit materials");
  return api<Material>(`/api/materials/${materialId}`, {
    method: "PATCH",
    json: { source_role },
  });
}

type OcrRefillDecision =
  | { refill: false }
  | {
      refill: true;
      downloadUrl: string;
      expiresIn: number;
      startPage: number;
      windowEnd: number;
      coveredPages: number[];
    };

export async function refillPdfOcr(
  materialId: string,
  recognize: typeof ocrEmptyPdfPagesInWindow = ocrEmptyPdfPagesInWindow,
): Promise<void> {
  if (isGuest()) return;

  const decision = await api<OcrRefillDecision>(
    `/api/materials/${materialId}/ocr-refetch`,
    { method: "POST" },
  );
  if (!decision.refill) return;

  const res = await fetch(decision.downloadUrl);
  if (!res.ok) {
    throw new Error(`PDF refill download failed (${res.status})`);
  }

  const pages = await recognize(await res.arrayBuffer(), {
    startPage: decision.startPage,
    covered: decision.coveredPages,
  });
  if (!pages?.length) return;

  await api<{ stored: number }>(`/api/materials/${materialId}/ocr-pages`, {
    method: "POST",
    json: { pages },
  });
}

/** Queue generation for an existing ready material with a single topic hint. */
export function topicGenerate(
  deckId: string,
  body: { topic: string; materialId?: string },
) {
  if (isGuest()) guestUnsupported("generate cards for a topic");
  return api<{ jobId: string }>(`/api/decks/${deckId}/topic-generate`, {
    method: "POST",
    json: body,
  });
}

export function requestMaterialUploadUrl(
  deckId: string,
  body: {
    filename: string;
    contentType: string;
    size: number;
    source_role?: SourceRole;
  },
) {
  if (isGuest()) guestUnsupported("upload materials");
  return api<UploadUrlResponse>(`/api/decks/${deckId}/materials/upload-url`, {
    method: "POST",
    json: body,
  });
}

export function presignPdfFigure(
  pdfMaterialId: string,
  body: {
    filename: string;
    contentType: "image/png";
    size: number;
    index: number;
  },
) {
  if (isGuest()) guestUnsupported("upload PDF figure crops");
  return api<{ uploadUrl: string; r2Key: string }>(
    `/api/materials/${pdfMaterialId}/figures/presign`,
    {
      method: "POST",
      json: body,
    },
  );
}

export function completeMaterial(
  materialId: string,
  opts?: {
    figureExtractMode?: FigureExtractMode;
    topicHints?: string[];
    /** Register uploaded bytes only; do not start card generation. */
    attachOnly?: boolean;
    ocrPages?: PageText[];
  },
) {
  if (isGuest()) guestUnsupported("complete material uploads");
  const json: {
    figureExtractMode?: FigureExtractMode;
    topicHints?: string[];
    attachOnly?: boolean;
    ocrPages?: PageText[];
  } = {};
  if (opts?.figureExtractMode !== undefined) {
    json.figureExtractMode = opts.figureExtractMode;
  }
  if (opts?.topicHints !== undefined) {
    json.topicHints = opts.topicHints;
  }
  if (opts?.attachOnly === true) {
    json.attachOnly = true;
  }
  if (opts?.ocrPages && opts.ocrPages.length > 0) {
    json.ocrPages = opts.ocrPages;
  }
  return api<CompleteMaterialResponse>(
    `/api/materials/${materialId}/complete`,
    {
      method: "POST",
      ...(Object.keys(json).length > 0 ? { json } : {}),
    },
  );
}
export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const ZIP_MIMES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "",
]);

/** Map browser File to upload content-type (prefer extension when type is zip/empty). */
export function resolveUploadContentType(file: File): string {
  const name = file.name.toLowerCase();
  const rawType = (file.type || "").trim().toLowerCase();
  if (name.endsWith(".pptx") && (ZIP_MIMES.has(rawType) || !rawType)) {
    return PPTX_MIME;
  }
  if (
    name.endsWith(".pdf") &&
    (!rawType || rawType === "application/octet-stream")
  ) {
    return "application/pdf";
  }
  if (rawType && !ZIP_MIMES.has(rawType)) return file.type;
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".pptx")) return PPTX_MIME;
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return rawType || "application/octet-stream";
}

/** Request signed URL, PUT the file to R2 (optional byte progress), then complete. */
export async function uploadMaterialFile(
  deckId: string,
  file: File,
  onProgress?: (percent: number) => void,
  opts?: {
    figureExtractMode?: FigureExtractMode;
    topicHints?: string[];
    attachOnly?: boolean;
    onScan?: () => void;
    source_role?: SourceRole;
  },
): Promise<CompleteMaterialResponse> {
  const contentType = resolveUploadContentType(file);
  const { materialId, uploadUrl } = await requestMaterialUploadUrl(deckId, {
    filename: file.name || "upload.bin",
    contentType,
    size: file.size,
    ...(opts?.source_role ? { source_role: opts.source_role } : {}),
  });

  try {
    await uploadWithProgress(uploadUrl, file, onProgress ?? (() => {}), {
      contentType,
    });
  } catch (err) {
    if (err instanceof UploadError) {
      throw new ApiError(
        err.status || 502,
        err.message || "Failed to upload file to storage",
      );
    }
    throw new ApiError(502, "Failed to upload file to storage");
  }

  const ocrPages =
    contentType === "application/pdf"
      ? await scanPdfOcrPages(file, opts?.onScan)
      : undefined;
  return completeMaterial(materialId, {
    figureExtractMode: opts?.figureExtractMode,
    topicHints: opts?.topicHints,
    attachOnly: opts?.attachOnly,
    ocrPages,
  });
}

export async function uploadPdfWithFigureCrops(
  deckId: string,
  pdfFile: File,
  figureFiles: File[],
  onProgress?: (percent: number) => void,
  opts?: {
    figureExtractMode?: FigureExtractMode;
    topicHints?: string[];
    onScan?: () => void;
    source_role?: SourceRole;
  },
): Promise<CompleteMaterialResponse> {
  const contentType = resolveUploadContentType(pdfFile);
  const { materialId, uploadUrl } = await requestMaterialUploadUrl(deckId, {
    filename: pdfFile.name || "upload.pdf",
    contentType,
    size: pdfFile.size,
    ...(opts?.source_role ? { source_role: opts.source_role } : {}),
  });

  try {
    await uploadWithProgress(uploadUrl, pdfFile, onProgress ?? (() => {}), {
      contentType,
    });
    for (const [index, figure] of figureFiles.entries()) {
      const crop = await presignPdfFigure(materialId, {
        filename: figure.name || `figure-${index}.png`,
        contentType: "image/png",
        size: figure.size,
        index,
      });
      await uploadWithProgress(crop.uploadUrl, figure, () => {}, {
        contentType: "image/png",
      });
    }
  } catch (err) {
    if (err instanceof UploadError) {
      throw new ApiError(
        err.status || 502,
        err.message || "Failed to upload file to storage",
      );
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, "Failed to upload file to storage");
  }

  return completeMaterial(materialId, {
    figureExtractMode: opts?.figureExtractMode,
    topicHints: opts?.topicHints,
    ocrPages: await scanPdfOcrPages(pdfFile, opts?.onScan),
  });
}

async function scanPdfOcrPages(
  file: Blob,
  onScan?: () => void,
): Promise<PageText[] | undefined> {
  onScan?.();
  try {
    return await ocrEmptyPdfPages(await file.arrayBuffer());
  } catch (err) {
    console.warn("PDF scan OCR skipped", err);
    return undefined;
  }
}
