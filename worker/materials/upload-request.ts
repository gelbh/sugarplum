import { HTTPException } from "hono/http-exception";
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES } from "./limits";
import {
  assertConfiguredR2AccountId,
  PPTX_CONTENT_TYPE,
  resolveSourceRole,
  resolveUpload,
} from "./upload";

export type ResolvedUpload = NonNullable<ReturnType<typeof resolveUpload>>;

export type ParsedUploadUrlRequest = {
  contentType: string;
  filenameHint: string;
  filename: string;
  size: number;
  sourceRole: ReturnType<typeof resolveSourceRole>;
  resolved: ResolvedUpload;
  putContentType: string;
};

export function parseUploadSize(sizeRaw: unknown): number {
  const size = typeof sizeRaw === "number" ? sizeRaw : Number(sizeRaw);
  if (!Number.isFinite(size) || size <= 0) {
    throw new HTTPException(400, { message: "Valid size required" });
  }
  if (size > MAX_FILE_BYTES) {
    throw new HTTPException(400, {
      message: `File must be ${MAX_FILE_BYTES / (1024 * 1024)}MB or smaller`,
    });
  }
  return size;
}

export function assertImageUploadSize(size: number): void {
  if (size > MAX_IMAGE_BYTES) {
    throw new HTTPException(400, {
      message: `Images for generation must be ${MAX_IMAGE_BYTES / (1024 * 1024)}MB or smaller`,
    });
  }
}

export function putContentTypeForResolved(
  kind: ResolvedUpload["kind"],
  contentType: string,
): string {
  return kind === "pptx" ? PPTX_CONTENT_TYPE : contentType;
}

export function parseUploadUrlRequest(
  body: {
    filename?: unknown;
    contentType?: unknown;
    size?: unknown;
    source_role?: unknown;
  },
  opts: {
    allowKinds: ReadonlySet<ResolvedUpload["kind"]>;
    rejectMessage: string;
  },
): ParsedUploadUrlRequest {
  const contentType =
    typeof body.contentType === "string" ? body.contentType.trim() : "";
  const filenameHint =
    typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim()
      : "";
  const resolved = resolveUpload(contentType, filenameHint);
  if (!resolved || !opts.allowKinds.has(resolved.kind)) {
    throw new HTTPException(400, { message: opts.rejectMessage });
  }
  const size = parseUploadSize(body.size);
  if (resolved.kind === "image") {
    assertImageUploadSize(size);
  }
  const filename = filenameHint || `upload.${resolved.ext}`;
  const sourceRole = resolveSourceRole(body.source_role, filename);
  return {
    contentType,
    filenameHint,
    filename,
    size,
    sourceRole,
    resolved,
    putContentType: putContentTypeForResolved(resolved.kind, contentType),
  };
}

export function requireR2UploadCredentials(env: {
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
}): {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
} {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new HTTPException(500, {
      message: "R2 upload signing is not configured",
    });
  }
  assertConfiguredR2AccountId(accountId);
  return { accountId, accessKeyId, secretAccessKey };
}
