import { compressPdfUnderLimit } from "./compressPdfUnderLimit";

export type ConsentedPdfCompressResult = {
  jobId?: string | null;
  status: string;
  manual_occlusion?: boolean;
  r2_key?: string | null;
  reused?: boolean;
};

export type RunConsentedPdfCompressUploadArgs<
  T extends ConsentedPdfCompressResult,
> = {
  file: File;
  maxBytes: number;
  figureFiles: File[];
  uploadPart: (part: File, figuresForThisPart: File[]) => Promise<T>;
  onProgress: (label: string) => void;
};

export type RunConsentedPdfCompressUploadResult<
  T extends ConsentedPdfCompressResult,
> =
  | { ok: false; message: string }
  | {
      ok: true;
      file: File;
      material: T;
      lastJobId: string | null;
      lastStatus: string;
    };

export async function runConsentedPdfCompressUpload<
  T extends ConsentedPdfCompressResult,
>({
  file,
  maxBytes,
  figureFiles,
  uploadPart,
  onProgress,
}: RunConsentedPdfCompressUploadArgs<T>): Promise<
  RunConsentedPdfCompressUploadResult<T>
> {
  const nameStem = file.name.replace(/\.pdf$/i, "") || "document";
  onProgress("Compressing…");
  const compressed = await compressPdfUnderLimit(file, maxBytes, {
    nameStem,
    onProgress,
  });
  if (!compressed.ok) {
    return { ok: false, message: compressed.message };
  }

  onProgress("Uploading…");
  try {
    const material = await uploadPart(compressed.file, figureFiles);
    return {
      ok: true,
      file: compressed.file,
      material,
      lastJobId: material.jobId ?? null,
      lastStatus: material.status,
    };
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Could not upload file";
    return { ok: false, message: detail };
  }
}
