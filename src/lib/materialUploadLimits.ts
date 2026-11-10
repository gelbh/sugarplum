export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function fileSizeCapMb(bytes: number = MAX_FILE_BYTES): number {
  return bytes / (1024 * 1024);
}

export function fileTooLargeMessage(bytes: number = MAX_FILE_BYTES): string {
  return `File must be ${fileSizeCapMb(bytes)}MB or smaller`;
}
