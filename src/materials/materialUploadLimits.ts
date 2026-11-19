export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Reject split-consent before client ZIP/PDF load when source exceeds this. */
export const MAX_SPLIT_SOURCE_BYTES = 200 * 1024 * 1024;

export type SplitSourceKind = "pdf" | "pptx";

export function fileSizeCapMb(bytes: number = MAX_FILE_BYTES): number {
  return bytes / (1024 * 1024);
}

export function fileTooLargeMessage(bytes: number = MAX_FILE_BYTES): string {
  return `File must be ${fileSizeCapMb(bytes)}MB or smaller`;
}

export function splitSourceTooLargeMessage(
  bytes: number = MAX_SPLIT_SOURCE_BYTES,
  kind: SplitSourceKind = "pdf",
): string {
  const label = kind === "pptx" ? "PPTX" : "PDF";
  return `This ${label} is larger than ${fileSizeCapMb(bytes)}MB. Compress it externally, then upload again. Split in the browser only works up to ${fileSizeCapMb(bytes)}MB.`;
}
