import { HTTPException } from "hono/http-exception";
import { normalizeTopicHints } from "../generation/topic-hints";
import type { SourceRole } from "../../src/lib/sourceRole";
import { MAX_PASTE_BYTES } from "./limits";
import { resolveSourceRole } from "./upload";

export type PasteMaterialBody = {
  text: string;
  topicHints: string[] | null;
  filename: string | null;
  sourceRole: SourceRole;
};

export function parsePasteMaterialBody(body: {
  text?: unknown;
  filename?: unknown;
  topicHints?: unknown;
  source_role?: unknown;
}): PasteMaterialBody {
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) throw new HTTPException(400, { message: "Text required" });
  const textBytes = new TextEncoder().encode(text).byteLength;
  if (textBytes > MAX_PASTE_BYTES) {
    throw new HTTPException(400, {
      message: "Paste must be 100KB or smaller",
    });
  }

  let topicHints: string[] | null = null;
  try {
    topicHints = normalizeTopicHints(body.topicHints);
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : "Invalid topicHints",
    });
  }

  const filename =
    typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim()
      : null;
  const sourceRole = resolveSourceRole(body.source_role, filename);

  return { text, topicHints, filename, sourceRole };
}
