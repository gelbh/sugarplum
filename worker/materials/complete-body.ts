import { HTTPException } from "hono/http-exception";
import type { FigureExtractMode } from "../generation/enqueue";
import { normalizeTopicHints } from "../generation/topic-hints";
import { parseOptionalJsonBody } from "../optional-json";
import { parseOcrPages, type OcrPageText } from "./ocr-sidecar";

export type CompleteMaterialBody = {
  figureExtractMode: FigureExtractMode | undefined;
  topicHints: string[] | null;
  attachOnly: boolean;
  ocrPages: OcrPageText[] | undefined;
};

export function parseCompleteMaterialBody(
  rawBody: string,
  materialKind: string,
): CompleteMaterialBody {
  let figureExtractMode: FigureExtractMode | undefined;
  let topicHints: string[] | null = null;
  let attachOnly = false;
  let ocrPages: OcrPageText[] | undefined;

  const parsed = parseOptionalJsonBody(rawBody);
  if (parsed === undefined) {
    return { figureExtractMode, topicHints, attachOnly, ocrPages };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const body = parsed as {
    figureExtractMode?: unknown;
    topicHints?: unknown;
    attachOnly?: unknown;
    ocrPages?: unknown;
  };
  const rawMode = body.figureExtractMode;
  if (rawMode !== undefined) {
    if (rawMode !== "fast" && rawMode !== "accurate") {
      throw new HTTPException(400, {
        message: "Invalid figureExtractMode",
      });
    }
    figureExtractMode = rawMode;
  }
  try {
    topicHints = normalizeTopicHints(body.topicHints);
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : "Invalid topicHints",
    });
  }
  if (body.attachOnly !== undefined && body.attachOnly !== false) {
    if (body.attachOnly !== true) {
      throw new HTTPException(400, { message: "Invalid attachOnly" });
    }
    attachOnly = true;
  }
  try {
    ocrPages = parseOcrPages(body.ocrPages);
  } catch {
    throw new HTTPException(400, { message: "Invalid ocrPages" });
  }
  if (ocrPages && materialKind !== "pdf") {
    throw new HTTPException(400, { message: "Invalid ocrPages" });
  }

  return { figureExtractMode, topicHints, attachOnly, ocrPages };
}
