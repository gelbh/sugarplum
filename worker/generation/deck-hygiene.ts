import { hygieneReasonsForDraft } from "./quality";
import {
  fieldsForQualityGate,
  mapStoredDraftToQualityDraft,
} from "./storedDraftQuality";

export type HygieneCardRow = {
  id: string;
  type: string;
  front_json: string;
  back_json: string;
  provenance_json: string | null;
  media_r2_keys_json: string | null;
};

export type HygieneFlaggedCard = {
  id: string;
  type: string;
  front_preview: string;
  reasons: string[];
};

function frontPreview(front: unknown): string {
  if (typeof front === "string") {
    const t = front.trim();
    return t.length > 120 ? `${t.slice(0, 117)}...` : t;
  }
  try {
    return JSON.stringify(front).slice(0, 120);
  } catch {
    return "";
  }
}

export function flagAcceptedCardsForHygiene(
  rows: HygieneCardRow[],
): HygieneFlaggedCard[] {
  const out: HygieneFlaggedCard[] = [];
  for (const row of rows) {
    let front: unknown;
    let back: unknown;
    try {
      front = JSON.parse(row.front_json);
      back = JSON.parse(row.back_json);
    } catch {
      out.push({
        id: row.id,
        type: row.type,
        front_preview: "",
        reasons: ["unparseable"],
      });
      continue;
    }
    let provenance: unknown = null;
    if (row.provenance_json) {
      try {
        provenance = JSON.parse(row.provenance_json);
      } catch {
        provenance = null;
      }
    }
    const fields = fieldsForQualityGate({
      type: row.type,
      front,
      back,
      provenance,
      media_r2_keys: row.media_r2_keys_json
        ? (() => {
            try {
              const parsed = JSON.parse(row.media_r2_keys_json) as unknown;
              return Array.isArray(parsed)
                ? parsed.filter((k): k is string => typeof k === "string")
                : null;
            } catch {
              return null;
            }
          })()
        : null,
    });
    const draft = mapStoredDraftToQualityDraft(fields);
    if (!draft) {
      out.push({
        id: row.id,
        type: row.type,
        front_preview: frontPreview(front),
        reasons: ["unmappable"],
      });
      continue;
    }
    const reasons = hygieneReasonsForDraft(draft);
    if (reasons.length === 0) continue;
    out.push({
      id: row.id,
      type: row.type,
      front_preview: frontPreview(draft.front),
      reasons,
    });
  }
  return out;
}
