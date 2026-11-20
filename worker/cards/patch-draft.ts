import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  assertSingleCloze,
  assertValidMcqOptions,
  OcclusionFrontSchema,
} from "../generation/schema";
import { mergeProvenancePagesIntoJson } from "../../src/study/notes/notesProvenanceWrite";
import {
  decodeStoredBack,
  encodeStoredBack,
  parseJsonField,
  type CardRow,
} from "./serialize";

export const OcclusionBackSchema = z.object({ answer: z.string().min(1) });
const TextFaceSchema = z.string().min(1);
/** Cloze Extra may be empty; other text backs still validated in the handler. */
const TextBackPatchSchema = z.string();
const CardTypeSchema = z.enum([
  "qa",
  "cloze",
  "image_label",
  "diagram",
  "mcq",
  "occlusion",
]);

/** PATCH body: string faces for text/MCQ; structured faces for occlusion; pages-only provenance. */
export const PatchDraftSchema = z
  .object({
    front: z.union([TextFaceSchema, OcclusionFrontSchema]).optional(),
    back: z.union([TextBackPatchSchema, OcclusionBackSchema]).optional(),
    options: z.array(z.string()).optional(),
    type: CardTypeSchema.optional(),
    provenance_pages: z.array(z.number().int().positive()).min(1).optional(),
  })
  .refine(
    (body) =>
      body.front !== undefined ||
      body.back !== undefined ||
      body.options !== undefined ||
      body.type !== undefined ||
      body.provenance_pages !== undefined,
    { message: "No fields to update" },
  );

export type PatchDraft = z.infer<typeof PatchDraftSchema>;

export function mergeProvenancePagesJson(
  existingJson: string | null,
  pages: readonly number[],
): string {
  return mergeProvenancePagesIntoJson(existingJson, pages);
}

export function parsePatchDraftBody(body: unknown): PatchDraft {
  const parsed = PatchDraftSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues[0]?.message ?? "Invalid patch body",
    });
  }
  return parsed.data;
}

export function isFacePatch(patch: PatchDraft): boolean {
  return (
    patch.front !== undefined ||
    patch.back !== undefined ||
    patch.options !== undefined ||
    patch.type !== undefined
  );
}

export type ResolvedFacePatch = {
  type: string;
  front_json: string;
  back_json: string;
  provenance_json: string | null;
};

/** Resolve face fields for a PATCH that updates front/back/options/type. */
export function resolveCardFacePatch(
  row: CardRow,
  patch: PatchDraft,
): ResolvedFacePatch {
  const nextType = patch.type ?? row.type;
  const nextFront = patch.front ?? parseJsonField(row.front_json, row.front_json);

  if (nextType === "occlusion") {
    const nextBack = patch.back ?? parseJsonField(row.back_json, row.back_json);
    const frontOk = OcclusionFrontSchema.safeParse(nextFront);
    const backOk = OcclusionBackSchema.safeParse(nextBack);
    if (!frontOk.success || !backOk.success) {
      throw new HTTPException(400, {
        message:
          "Occlusion cards need structured front regions and back.answer",
      });
    }
    return {
      type: nextType,
      front_json: JSON.stringify(frontOk.data),
      back_json: JSON.stringify(backOk.data),
      provenance_json: patch.provenance_pages
        ? mergeProvenancePagesJson(row.provenance_json, patch.provenance_pages)
        : row.provenance_json,
    };
  }

  const storedBack = decodeStoredBack(row.type, row.back_json);
  const allowedTypes = new Set([
    "qa",
    "cloze",
    "image_label",
    "diagram",
    "mcq",
  ]);
  if (!allowedTypes.has(nextType)) {
    throw new HTTPException(400, { message: "Unsupported card type" });
  }
  if (typeof nextFront !== "string") {
    throw new HTTPException(400, {
      message: "Text card front must be a string",
    });
  }
  if (nextType === "cloze") {
    try {
      assertSingleCloze(nextFront);
    } catch (err) {
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : "Invalid cloze",
      });
    }
  }

  let nextBack: string;
  let nextOptions: string[] | undefined;
  if (nextType === "mcq") {
    const prior =
      row.type === "mcq"
        ? storedBack
        : {
            back: typeof patch.back === "string" ? patch.back : "",
            options: undefined as string[] | undefined,
          };
    const patchBack =
      typeof patch.back === "string" ? patch.back : prior.back;
    try {
      const mcq = assertValidMcqOptions(
        patchBack,
        patch.options ?? prior.options,
      );
      nextBack = mcq.back;
      nextOptions = mcq.options;
    } catch (err) {
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : "Invalid MCQ",
      });
    }
  } else {
    if (patch.back !== undefined && typeof patch.back !== "string") {
      throw new HTTPException(400, {
        message: "Text card back must be a string",
      });
    }
    nextBack =
      typeof patch.back === "string" ? patch.back : storedBack.back;
    // Cloze Extra may be ""; other text types still need a non-empty back.
    if (nextType !== "cloze" && nextBack.trim().length < 1) {
      throw new HTTPException(400, { message: "Back cannot be empty" });
    }
  }

  return {
    type: nextType,
    front_json: JSON.stringify(nextFront),
    back_json: encodeStoredBack(nextType, nextBack, nextOptions),
    provenance_json: patch.provenance_pages
      ? mergeProvenancePagesJson(row.provenance_json, patch.provenance_pages)
      : row.provenance_json,
  };
}
