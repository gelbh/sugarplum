export type CardRow = {
  id: string;
  deck_id: string;
  job_id: string | null;
  type: string;
  front_json: string;
  back_json: string;
  media_r2_keys_json: string | null;
  provenance_json: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type McqBackJson = { answer: string; options: string[] };

function isMcqBackJson(value: unknown): value is McqBackJson {
  return (
    typeof value === "object" &&
    value !== null &&
    "answer" in value &&
    typeof (value as McqBackJson).answer === "string" &&
    "options" in value &&
    Array.isArray((value as McqBackJson).options)
  );
}

export function parseJsonField<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function decodeStoredBack(
  type: string,
  backJson: string,
): { back: string; options?: string[] } {
  if (type !== "mcq") {
    return { back: parseJsonField<string>(backJson, backJson) };
  }
  const parsed = parseJsonField<unknown>(backJson, null);
  if (isMcqBackJson(parsed)) {
    return { back: parsed.answer, options: parsed.options };
  }
  return { back: parseJsonField<string>(backJson, "") };
}

/** Persist card back JSON (MCQ nests answer + options). */
export function encodeStoredBack(
  type: string,
  back: string,
  options?: string[],
): string {
  if (type === "mcq") {
    return JSON.stringify({ answer: back, options: options ?? [] });
  }
  return JSON.stringify(back);
}

/** Public card JSON for draft review / study clients. */
export function serializeCard(row: CardRow) {
  const front = parseJsonField(row.front_json, row.front_json);
  const media_r2_keys = row.media_r2_keys_json
    ? parseJsonField<string[]>(row.media_r2_keys_json, [])
    : [];
  const provenance = row.provenance_json
    ? parseJsonField(row.provenance_json, null)
    : null;
  const base = {
    id: row.id,
    deck_id: row.deck_id,
    job_id: row.job_id,
    type: row.type,
    front,
    media_r2_keys,
    provenance,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (row.type === "occlusion") {
    return {
      ...base,
      back: parseJsonField(row.back_json, row.back_json),
    };
  }
  const { back, options } = decodeStoredBack(row.type, row.back_json);
  const card = { ...base, back };
  if (row.type === "mcq" && options !== undefined) {
    return { ...card, options };
  }
  return card;
}
