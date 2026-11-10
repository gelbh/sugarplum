import { splitPdfUnderLimit } from "./splitPdfUnderLimit";

export type ConsentedPdfSplitPartResult = {
  jobId?: string | null;
  status: string;
  manual_occlusion?: boolean;
  r2_key?: string | null;
};

export type RunConsentedPdfSplitUploadArgs<T extends ConsentedPdfSplitPartResult> =
  {
    file: File;
    maxBytes: number;
    figureFiles: File[];
    uploadPart: (part: File, figuresForThisPart: File[]) => Promise<T>;
    onProgress: (label: string) => void;
  };

export type RunConsentedPdfSplitUploadResult<
  T extends ConsentedPdfSplitPartResult,
> =
  | { ok: false; message: string }
  | {
      ok: true;
      parts: File[];
      lastJobId: string | null;
      lastStatus: string;
      skippedFigures: boolean;
      materials: T[];
    };

export async function runConsentedPdfSplitUpload<
  T extends ConsentedPdfSplitPartResult,
>({
  file,
  maxBytes,
  figureFiles,
  uploadPart,
  onProgress,
}: RunConsentedPdfSplitUploadArgs<T>): Promise<
  RunConsentedPdfSplitUploadResult<T>
> {
  const nameStem = file.name.replace(/\.pdf$/i, "") || "document";
  onProgress("Splitting PDF…");
  const split = await splitPdfUnderLimit(file, maxBytes, { nameStem });
  if (!split.ok) {
    return { ok: false, message: split.message };
  }

  const parts = split.files;
  const skippedFigures = figureFiles.length > 0 && parts.length > 1;
  const materials: T[] = [];
  let lastJobId: string | null = null;
  let lastStatus = "";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    onProgress(`Uploading ${i + 1} of ${parts.length}`);
    const figuresForThisPart = parts.length === 1 ? figureFiles : [];
    try {
      const material = await uploadPart(part, figuresForThisPart);
      materials.push(material);
      lastStatus = material.status;
      if (material.jobId) lastJobId = material.jobId;
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : "Could not upload file";
      const stored =
        i > 0
          ? ` The first ${i} part${i === 1 ? " was" : "s were"} already stored.`
          : "";
      return {
        ok: false,
        message: `Failed on part ${i + 1} of ${parts.length}: ${detail}${stored}`,
      };
    }
  }

  return {
    ok: true,
    parts,
    lastJobId,
    lastStatus,
    skippedFigures,
    materials,
  };
}
