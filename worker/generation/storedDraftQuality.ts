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

/** View / serializeCard shape → quality gate fields. */
export function fieldsForQualityGate(card: {
  type: string;
  front: unknown;
  back: unknown;
  options?: string[] | null;
  provenance?: unknown;
  media_r2_keys?: string[] | null;
  media_keys?: string[] | null;
}): StoredDraftFields {
  return {
    type: card.type,
    front: card.front,
    back:
      card.type === "mcq" && typeof card.back === "string"
        ? { answer: card.back, options: card.options ?? [] }
        : card.back,
    options: card.options,
    provenance: card.provenance,
    media_keys: card.media_keys ?? card.media_r2_keys,
  };
}

type TextType = "qa" | "cloze" | "image_label" | "diagram" | "mcq";

const TEXT_TYPES = new Set<string>([
  "qa",
  "cloze",
  "image_label",
  "diagram",
  "mcq",
]);

function defaultProvenance() {
  return { pages: [1] as number[], excerpt: "stored" };
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
      provenance: provenance ?? defaultProvenance(),
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
    provenance: provenance ?? defaultProvenance(),
  };
  const parsed = CardDraftSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function isStoredDraftSafe(fields: StoredDraftFields): boolean {
  const mapped = mapStoredDraftToQualityDraft(fields);
  if (!mapped) return false;
  return filterDraftsByQuality([mapped]).length === 1;
}

/** Partition with one Layer-1 pass so front-key dedupe applies across the batch. */
export function partitionStoredDraftsByQuality<T extends StoredDraftFields>(
  rows: T[],
): { safe: T[]; unsafe: T[] } {
  const pairs = rows.map((row) => ({
    row,
    mapped: mapStoredDraftToQualityDraft(row),
  }));
  const survivors = new Set(
    filterDraftsByQuality(
      pairs.flatMap((pair) => (pair.mapped ? [pair.mapped] : [])),
    ),
  );
  const safe: T[] = [];
  const unsafe: T[] = [];
  for (const pair of pairs) {
    if (pair.mapped && survivors.has(pair.mapped)) safe.push(pair.row);
    else unsafe.push(pair.row);
  }
  return { safe, unsafe };
}
