import { splitPptxUnderLimit } from "./splitPptxUnderLimit";

export type ConsentedPptxSplitPartResult = {
  jobId?: string | null;
  status: string;
  manual_occlusion?: boolean;
  r2_key?: string | null;
};

export type RunConsentedPptxSplitUploadArgs<
  T extends ConsentedPptxSplitPartResult,
> = {
  file: File;
  maxBytes: number;
  uploadPart: (part: File) => Promise<T>;
  onProgress: (label: string) => void;
};

export type RunConsentedPptxSplitUploadResult<
  T extends ConsentedPptxSplitPartResult,
> =
  | {
      ok: false;
      message: string;
      next: "error";
      reason?: "invalid_pptx" | "empty" | "slide_too_large";
      slideCount?: number;
    }
  | {
      ok: true;
      parts: File[];
      lastJobId: string | null;
      lastStatus: string;
      materials: T[];
    };

export async function runConsentedPptxSplitUpload<
  T extends ConsentedPptxSplitPartResult,
>({
  file,
  maxBytes,
  uploadPart,
  onProgress,
}: RunConsentedPptxSplitUploadArgs<T>): Promise<
  RunConsentedPptxSplitUploadResult<T>
> {
  const nameStem = file.name.replace(/\.pptx$/i, "") || "presentation";
  onProgress("Splitting PPTX…");
  const split = await splitPptxUnderLimit(file, maxBytes, { nameStem });
  if (!split.ok) {
    return {
      ok: false,
      message: split.message,
      next: "error",
      reason: split.reason,
      slideCount:
        split.reason === "slide_too_large" ? split.slideCount : undefined,
    };
  }

  const parts = split.files;
  const materials: T[] = [];
  let lastJobId: string | null = null;
  let lastStatus = "";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    onProgress(`Uploading ${i + 1} of ${parts.length}`);
    try {
      const material = await uploadPart(part);
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
        next: "error",
        message: `Failed on part ${i + 1} of ${parts.length}: ${detail}${stored}`,
      };
    }
  }

  return {
    ok: true,
    parts,
    lastJobId,
    lastStatus,
    materials,
  };
}
