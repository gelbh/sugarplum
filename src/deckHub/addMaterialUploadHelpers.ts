import { PPTX_MIME, resolveUploadContentType } from "../api/client";

export const UPLOAD_ACCEPT =
  "application/pdf,.pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

export const ALLOWED_UPLOAD_TYPES = new Set([
  "application/pdf",
  PPTX_MIME,
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function isAllowedUploadFile(file: File): boolean {
  return ALLOWED_UPLOAD_TYPES.has(resolveUploadContentType(file));
}

export function uploadKindLabel(file: File): string {
  const type = resolveUploadContentType(file);
  if (type === "application/pdf") return "PDF";
  if (type === PPTX_MIME) return "PPTX";
  if (type.startsWith("image/")) return "Image";
  return "File";
}

export function formatUploadBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
