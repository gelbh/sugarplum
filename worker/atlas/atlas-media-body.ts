import { HTTPException } from "hono/http-exception";
import { IMAGE_ROLES } from "./datasets/schema";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type AtlasRefBody = {
  fieldKey: string | null;
  citation: string;
  url: string | null;
  note: string | null;
  materialId: string | null;
  page: number | null;
};

export type AtlasImageUploadBody = {
  contentType: string;
  size: number;
};

export type AtlasImageCreateBody = {
  src: string;
  role: string;
  caption: string | null;
  credit: string | null;
  license: string | null;
  sourceUrl: string | null;
  isHero: boolean;
};

export function parseAtlasRefBody(body: {
  field?: unknown;
  citation?: unknown;
  url?: unknown;
  note?: unknown;
  materialId?: unknown;
  page?: unknown;
}): AtlasRefBody {
  const citation =
    typeof body.citation === "string" ? body.citation.trim() : "";
  if (!citation) {
    throw new HTTPException(400, { message: "citation required" });
  }

  const fieldKey =
    typeof body.field === "string"
      ? body.field.trim() || null
      : body.field === null
        ? null
        : null;
  const url = typeof body.url === "string" ? body.url.trim() || null : null;
  const note = typeof body.note === "string" ? body.note.trim() || null : null;
  const materialId =
    typeof body.materialId === "string" ? body.materialId : null;
  const page =
    typeof body.page === "number" && Number.isFinite(body.page)
      ? body.page
      : null;

  return { fieldKey, citation, url, note, materialId, page };
}

export function parseAtlasImageUploadBody(body: {
  contentType?: unknown;
  size?: unknown;
}): AtlasImageUploadBody {
  const contentType =
    typeof body.contentType === "string" ? body.contentType.trim() : "";
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new HTTPException(400, {
      message: "Only jpeg/png/webp uploads are allowed",
    });
  }
  const size = typeof body.size === "number" ? body.size : Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    throw new HTTPException(400, { message: "Valid size required" });
  }
  if (size > MAX_IMAGE_BYTES) {
    throw new HTTPException(400, { message: "Image must be 10MB or smaller" });
  }
  return { contentType, size };
}

export function imageExtForContentType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export function parseAtlasImageCreateBody(body: {
  src?: unknown;
  role?: unknown;
  caption?: unknown;
  credit?: unknown;
  license?: unknown;
  sourceUrl?: unknown;
  isHero?: unknown;
}): AtlasImageCreateBody {
  const src = typeof body.src === "string" ? body.src.trim() : "";
  if (!src) throw new HTTPException(400, { message: "src required" });
  const role =
    typeof body.role === "string" &&
    (IMAGE_ROLES as readonly string[]).includes(body.role)
      ? body.role
      : null;
  if (!role) throw new HTTPException(400, { message: "Valid role required" });

  const caption =
    typeof body.caption === "string" ? body.caption.trim() || null : null;
  const credit =
    typeof body.credit === "string" ? body.credit.trim() || null : null;
  const license =
    typeof body.license === "string" ? body.license.trim() || null : null;
  const sourceUrl =
    typeof body.sourceUrl === "string" ? body.sourceUrl.trim() || null : null;
  const isHero = body.isHero === true;

  return { src, role, caption, credit, license, sourceUrl, isHero };
}
