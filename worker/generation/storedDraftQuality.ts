import { filterDraftsByQuality } from "./quality";
import {
  CardDraftSchema,
  type CardDraft,
} from "./schema";

export type StoredDraftFields = {
  type: string;
  front: unknown;
  back: unknown;
  options?: string[] | null;
  provenance?: unknown;
  media_keys?: string[] | null;
};

type TextType = "qa" | "cloze" | "image_label" | "diagram" | "mcq";

const TEXT_TYPES = new Set<string>([
  "qa",
  "cloze",
  "image_label",
  "diagram",
  "mcq",
]);

function defaultProvenance(excerpt: string) {
  return { pages: [1] as number[], excerpt: excerpt.slice(0, 240) || "stored" };
}

/**
 * Map a stored draft card into a generation `CardDraft` for Layer-1 quality.
 * Returns null when the row cannot be mapped (treat as not safe).
 * Occlusion / image_label: only safe when schema-valid after map; unmappable → null.
 */
export function mapStoredDraftToQualityDraft(
  fields: StoredDraftFields,
): CardDraft | null {
  const provenance =
    fields.provenance &&
    typeof fields.provenance === "object" &&
    fields.provenance !== null
      ? fields.provenance
      : null;

  if (fields.type === "occlusion") {
    const candidate = {
      type: "occlusion" as const,
      front: fields.front,
      back: fields.back,
      provenance: provenance ?? defaultProvenance("occlusion"),
      ...(fields.media_keys?.length
        ? { media_keys: fields.media_keys }
        : {}),
    };
    const parsed = CardDraftSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  }

  if (!TEXT_TYPES.has(fields.type)) return null;
  if (typeof fields.front !== "string") return null;

  let back: string;
  let options: string[] | undefined;
  if (fields.type === "mcq") {
    if (
      typeof fields.back === "object" &&
      fields.back !== null &&
      "answer" in fields.back &&
      typeof (fields.back as { answer: unknown }).answer === "string"
    ) {
      back = (fields.back as { answer: string }).answer;
      const rawOpts = (fields.back as { options?: unknown }).options;
      options = Array.isArray(rawOpts)
        ? rawOpts.filter((o): o is string => typeof o === "string")
        : fields.options?.filter((o): o is string => typeof o === "string");
    } else if (typeof fields.back === "string") {
      back = fields.back;
      options = fields.options?.filter((o): o is string => typeof o === "string");
    } else {
      return null;
    }
  } else {
    if (typeof fields.back !== "string") return null;
    back = fields.back;
  }

  const candidate = {
    type: fields.type as TextType,
    front: fields.front,
    back,
    ...(options ? { options } : {}),
    provenance: provenance ?? defaultProvenance(fields.front),
  };
  const parsed = CardDraftSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function isStoredDraftSafe(fields: StoredDraftFields): boolean {
  const mapped = mapStoredDraftToQualityDraft(fields);
  if (!mapped) return false;
  return filterDraftsByQuality([mapped]).length === 1;
}

export function partitionStoredDraftsByQuality<T extends StoredDraftFields>(
  rows: T[],
): { safe: T[]; unsafe: T[] } {
  const safe: T[] = [];
  const unsafe: T[] = [];
  for (const row of rows) {
    if (isStoredDraftSafe(row)) safe.push(row);
    else unsafe.push(row);
  }
  return { safe, unsafe };
}
