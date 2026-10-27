import type { Env } from "../env";
import { MAX_IMAGE_BYTES } from "./limits";

export type FigureMime = "image/png" | "image/jpeg" | "image/webp";

export type FigureCrop = {
  page: number;
  index: number;
  caption: string;
  mimeType: FigureMime;
  bytes: ArrayBuffer;
};

export const MAX_FIGURES_PER_PDF = 20;

export type FigureExtractResult = { crops: FigureCrop[]; warning?: string };

type DoclingTextItem = {
  self_ref?: string;
  text?: string;
};

type DoclingPictureItem = {
  prov?: Array<{ page_no?: number }>;
  captions?: Array<{ cref?: string }>;
  image?: { mimetype?: string; uri?: string };
};

type DoclingJsonDocument = {
  pictures?: DoclingPictureItem[];
  texts?: DoclingTextItem[];
};

const ALLOWED_MIME = new Set<FigureMime>([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/** Narrow adapter: Docling convert JSON → crop DTOs (embedded base64 today; zip/referenced swappable). */
export function parseFigureCropsFromDoclingJson(
  jsonContent: unknown,
): FigureCrop[] {
  const doc = normalizeDoclingJsonContent(jsonContent);
  if (!doc?.pictures?.length) return [];

  const captionByRef = buildCaptionLookup(doc.texts);
  const crops: FigureCrop[] = [];

  for (let index = 0; index < doc.pictures.length; index++) {
    const picture = doc.pictures[index];
    const decoded = decodePictureUri(picture.image?.uri, picture.image?.mimetype);
    if (!decoded) continue;
    if (decoded.bytes.byteLength === 0) continue;
    if (decoded.bytes.byteLength > MAX_IMAGE_BYTES) continue;

    const page = picture.prov?.[0]?.page_no ?? 1;
    const caption = resolvePictureCaption(picture, captionByRef);

    crops.push({
      page: page >= 1 ? page : 1,
      index,
      caption,
      mimeType: decoded.mimeType,
      bytes: decoded.bytes,
    });
  }

  return crops.slice(0, MAX_FIGURES_PER_PDF);
}

export async function extractFiguresViaDocling(
  env: Pick<Env, "DOCLING_URL" | "DOCLING_API_KEY">,
  pdfBytes: ArrayBuffer,
  opts?: { signal?: AbortSignal; fetchFn?: typeof fetch },
): Promise<FigureExtractResult> {
  const baseUrl = env.DOCLING_URL?.trim();
  if (!baseUrl) return { crops: [] };

  const fetchFn = opts?.fetchFn ?? fetch;
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/convert/file`;

  const form = new FormData();
  form.append(
    "files",
    new Blob([pdfBytes], { type: "application/pdf" }),
    "document.pdf",
  );
  form.append("from_formats", "pdf");
  form.append("to_formats", "json");
  form.append("include_images", "true");
  form.append("image_export_mode", "embedded");

  const headers: Record<string, string> = {};
  const apiKey = env.DOCLING_API_KEY?.trim();
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  try {
    const response = await fetchFn(url, {
      method: "POST",
      body: form,
      headers,
      signal: opts?.signal,
    });

    if (!response.ok) {
      return {
        crops: [],
        warning: `Docling unavailable (HTTP ${response.status})`,
      };
    }

    const payload: unknown = await response.json();
    const jsonContent = extractJsonContent(payload);
    return { crops: parseFigureCropsFromDoclingJson(jsonContent) };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Docling request failed";
    return { crops: [], warning: `Docling unavailable (${message})` };
  }
}

function extractJsonContent(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return null;
  const document = (payload as { document?: { json_content?: unknown } })
    .document;
  const raw = document?.json_content;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  return raw ?? null;
}

function normalizeDoclingJsonContent(
  jsonContent: unknown,
): DoclingJsonDocument | null {
  if (!jsonContent || typeof jsonContent !== "object") return null;
  const obj = jsonContent as Record<string, unknown>;
  if (obj.pictures !== undefined && !Array.isArray(obj.pictures)) return null;
  if (obj.texts !== undefined && !Array.isArray(obj.texts)) return null;
  return jsonContent as DoclingJsonDocument;
}

function buildCaptionLookup(
  texts: DoclingTextItem[] | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of texts ?? []) {
    if (item.self_ref && item.text) map.set(item.self_ref, item.text);
  }
  return map;
}

function resolvePictureCaption(
  picture: DoclingPictureItem,
  captionByRef: Map<string, string>,
): string {
  for (const cap of picture.captions ?? []) {
    const cref = cap.cref;
    if (cref && captionByRef.has(cref)) return captionByRef.get(cref)!;
  }
  return "";
}

function normalizeMime(raw: string | undefined): FigureMime | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (lower === "image/jpg") return "image/jpeg";
  if (ALLOWED_MIME.has(lower as FigureMime)) return lower as FigureMime;
  return null;
}

function decodePictureUri(
  uri: string | undefined,
  declaredMime: string | undefined,
): { bytes: ArrayBuffer; mimeType: FigureMime } | null {
  if (!uri) return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;

  const dataUrlMatch = /^data:([^;,]+)?;base64,(.+)$/i.exec(trimmed);
  const b64 = dataUrlMatch
    ? dataUrlMatch[2]
    : trimmed.includes("/")
      ? null
      : trimmed;
  if (!b64) return null;

  let mimeType: FigureMime;
  if (dataUrlMatch?.[1]) {
    const fromUri = normalizeMime(dataUrlMatch[1]);
    // Explicit data-URL MIME that we do not support → drop the picture.
    if (!fromUri) return null;
    mimeType = fromUri;
  } else {
    mimeType = normalizeMime(declaredMime) ?? "image/png";
  }

  try {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return { bytes: bytes.buffer, mimeType };
  } catch {
    return null;
  }
}
