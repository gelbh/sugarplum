import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getDb } from "../db/client";
import { OcclusionFrontSchema } from "../generation/schema";
import { parseFigureR2Key } from "./figures";

export const HubCreateTextCardSchema = z
  .object({
    type: z.enum(["qa", "cloze", "mcq"]),
    front: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1)),
    /** Cloze Extra may be ""; study answer comes from the blank. */
    back: z.string().transform((s) => s.trim()),
    options: z.array(z.string()).optional(),
  })
  .refine((body) => body.type === "cloze" || body.back.length > 0, {
    message: "Back is required",
    path: ["back"],
  });

export const HubCreateImageLabelSchema = z.object({
  type: z.literal("image_label"),
  front: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1)),
  back: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1)),
  media_r2_keys: z.array(z.string().min(1)).min(1),
});

export const HubCreateOcclusionSchema = z.object({
  type: z.literal("occlusion"),
  front: OcclusionFrontSchema,
  back: z.object({ answer: z.string().min(1) }),
});

export const HubCreateCardSchema = z.union([
  HubCreateTextCardSchema,
  HubCreateImageLabelSchema,
  HubCreateOcclusionSchema,
]);

export async function assertDeckMaterialKeys(
  db: ReturnType<typeof getDb>,
  deckId: string,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return;
  const { results } = await db
    .prepare("SELECT id, kind, r2_key FROM materials WHERE deck_id = ?")
    .bind(deckId)
    .all<{ id: string; kind: string; r2_key: string | null }>();
  const allowed = new Set<string>();
  const pdfIds = new Set<string>();
  for (const row of results ?? []) {
    if (row.r2_key) allowed.add(row.r2_key);
    if (row.kind === "pdf") pdfIds.add(row.id);
  }
  for (const key of keys) {
    if (allowed.has(key)) continue;
    const parsed = parseFigureR2Key(key);
    if (
      parsed &&
      parsed.deckId === deckId &&
      pdfIds.has(parsed.pdfMaterialId)
    ) {
      continue;
    }
    throw new HTTPException(400, {
      message: "Media key not found for deck",
    });
  }
}
