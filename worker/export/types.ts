import { z } from "zod";

export type ExportScope =
  | { type: "deck"; deckId: string }
  | { type: "subject"; subjectId: string }
  | { type: "selection"; deckIds: string[]; subjectIds: string[] };

export type ExportWarnings = {
  missingMedia: number;
  skippedCards: number;
};

export type ExportJobStatus = "queued" | "running" | "ready" | "failed";

export const ExportJobStatusSchema = z.enum([
  "queued",
  "running",
  "ready",
  "failed",
]);

export const ExportScopeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("deck"),
    deckId: z.string().min(1),
  }),
  z.object({
    type: z.literal("subject"),
    subjectId: z.string().min(1),
  }),
  z.object({
    type: z.literal("selection"),
    deckIds: z.array(z.string().min(1)),
    subjectIds: z.array(z.string().min(1)),
  }),
]);

/** POST /api/exports body. */
export const CreateExportBodySchema = ExportScopeSchema;

export type CreateExportBody = z.infer<typeof CreateExportBodySchema>;

export const ExportWarningsSchema = z.object({
  missingMedia: z.number().int().nonnegative(),
  skippedCards: z.number().int().nonnegative(),
});

export type ExportJobRow = {
  id: string;
  user_id: string;
  status: ExportJobStatus;
  request_json: string;
  r2_key: string | null;
  error: string | null;
  warning_json: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export function parseExportScope(raw: unknown): ExportScope {
  const result = ExportScopeSchema.safeParse(raw);
  if (!result.success) {
    throw new Error("Invalid export scope");
  }
  return result.data;
}

export function parseExportScopeJson(raw: string): ExportScope {
  try {
    return parseExportScope(JSON.parse(raw));
  } catch {
    throw new Error("Invalid export scope");
  }
}

export function parseExportWarnings(raw: unknown): ExportWarnings | null {
  const result = ExportWarningsSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseExportWarningsJson(
  raw: string | null | undefined,
): ExportWarnings | null {
  if (!raw) return null;
  try {
    return parseExportWarnings(JSON.parse(raw));
  } catch {
    return null;
  }
}

export const EMPTY_EXPORT_WARNINGS: ExportWarnings = {
  missingMedia: 0,
  skippedCards: 0,
};
