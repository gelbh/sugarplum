/** Byte-progress PUT via XHR (fetch has no reliable upload progress in browsers). */

export type UploadWithProgressOptions = {
  contentType?: string;
  method?: string;
};

export class UploadError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

/**
 * Upload `body` to `url` and report a monotonic 0–100 percent via `onProgress`.
 * Rejects with UploadError on network failure or non-2xx status.
 */
export function uploadWithProgress(
  url: string,
  body: Blob,
  onProgress: (percent: number) => void,
  options: UploadWithProgressOptions = {},
): Promise<void> {
  const { contentType, method = "PUT" } = options;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastPercent = 0;

    const report = (percent: number) => {
      const next = Math.min(100, Math.max(lastPercent, percent));
      if (next !== lastPercent) {
        lastPercent = next;
        onProgress(next);
      }
    };

    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable || ev.total <= 0) return;
      report((100 * ev.loaded) / ev.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        report(100);
        resolve();
        return;
      }
      reject(new UploadError(xhr.status, "Upload failed"));
    };

    xhr.onerror = () => {
      reject(new UploadError(0, "Upload network error"));
    };

    xhr.onabort = () => {
      reject(new UploadError(0, "Upload aborted"));
    };

    xhr.open(method, url);
    if (contentType) {
      xhr.setRequestHeader("Content-Type", contentType);
    }
    onProgress(0);
    xhr.send(body);
  });
}
