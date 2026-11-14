import { HTTPException } from "hono/http-exception";
import {
  isSourceRole,
  suggestSourceRole,
  type SourceRole,
} from "../../src/lib/sourceRole";

export function resolveSourceRole(
  bodyRole: unknown,
  filename: string | null,
): SourceRole {
  if (isSourceRole(bodyRole)) return bodyRole;
  return suggestSourceRole(filename);
}

/** Pastes ≤100KB use the same R2 path; schema has no body_text column for D1 inline. */
export const PASTE_READY = "ready";
export const FILE_UPLOADING = "uploading";
export const FILE_READY = "ready";
export const PDF_CONTENT_TYPE = "application/pdf";
export const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const DEFAULT_R2_BUCKET = "sugarplum-materials";
export const OCR_REFETCH_EXPIRES_SEC = 900;
export const ZIP_CONTENT_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);


type UploadKind = "pdf" | "pptx" | "image";

export function resolveUpload(
  contentType: string,
  filename: string,
): { kind: UploadKind; ext: string } | null {
  const lowerName = filename.toLowerCase();
  if (contentType === PDF_CONTENT_TYPE) return { kind: "pdf", ext: "pdf" };
  if (contentType === PPTX_CONTENT_TYPE) return { kind: "pptx", ext: "pptx" };
  if (ZIP_CONTENT_TYPES.has(contentType) && lowerName.endsWith(".pptx")) {
    return { kind: "pptx", ext: "pptx" };
  }
  if (IMAGE_CONTENT_TYPES.has(contentType)) {
    const ext =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "jpg";
    return { kind: "image", ext };
  }
  return null;
}

export function assertConfiguredR2AccountId(accountId: string): void {
  const trimmed = accountId.trim();
  if (
    !trimmed ||
    trimmed.startsWith("REPLACE_") ||
    trimmed.includes("REPLACE_WITH")
  ) {
    throw new HTTPException(500, {
      message: "R2_ACCOUNT_ID is not configured",
    });
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

export function sanitizeDownloadFilename(filename: string | null): string {
  const raw = (filename ?? "").trim();
  const base = raw.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/["\r\n]/g, "").trim();
  return cleaned || "download.bin";
}

export function contentTypeForMaterial(
  kind: string,
  r2Key: string,
  filename: string | null,
): string {
  const lowerKey = r2Key.toLowerCase();
  const lowerName = (filename ?? "").toLowerCase();
  if (
    kind === "paste" ||
    lowerKey.endsWith(".txt") ||
    lowerName.endsWith(".txt")
  ) {
    return "text/plain; charset=utf-8";
  }
  if (
    kind === "pdf" ||
    lowerKey.endsWith(".pdf") ||
    lowerName.endsWith(".pdf")
  ) {
    return PDF_CONTENT_TYPE;
  }
  if (
    kind === "pptx" ||
    lowerKey.endsWith(".pptx") ||
    lowerName.endsWith(".pptx")
  ) {
    return PPTX_CONTENT_TYPE;
  }
  if (lowerKey.endsWith(".png") || lowerName.endsWith(".png")) {
    return "image/png";
  }
  if (lowerKey.endsWith(".webp") || lowerName.endsWith(".webp")) {
    return "image/webp";
  }
  if (
    lowerKey.endsWith(".jpg") ||
    lowerKey.endsWith(".jpeg") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg")
  ) {
    return "image/jpeg";
  }
  if (kind === "image") return "application/octet-stream";
  return "application/octet-stream";
}
