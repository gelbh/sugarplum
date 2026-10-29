export type AnkiNoteSpec = {
  model: "basic" | "cloze" | "sugarplum_mcq" | "sugarplum_occlusion";
  fields: Record<string, string>;
  tags?: string[];
};

export type CardForAnkiNote = {
  type: string;
  front: unknown;
  back: unknown;
  options?: string[];
};

export type AnkiNoteResult = AnkiNoteSpec | { skip: true; reason: string };
export type AnkiNotesResult =
  | AnkiNoteSpec[]
  | { skip: true; reason: string };

const ANKI_CLOZE_RE = /\{\{c\d+::[\s\S]*?\}\}/;
const UNDERSCORE_BLANK_RE = /_{3,}/;

type OcclusionRegion = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
};

type OcclusionFront = {
  image_key: string;
  mode: "hide_one";
  regions: OcclusionRegion[];
  prompt?: string;
};

function fieldText(value: unknown): string | null {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    "prompt" in value &&
    typeof (value as { prompt: unknown }).prompt === "string"
  ) {
    return (value as { prompt: string }).prompt;
  }
  return null;
}

/** Convert a single `___` blank into Anki `{{c1::answer}}` using the card back. */
export function convertUnderscoreCloze(
  front: string,
  back: string,
): string | null {
  if (ANKI_CLOZE_RE.test(front)) return front;
  const blanks = front.match(new RegExp(UNDERSCORE_BLANK_RE.source, "g")) ?? [];
  if (blanks.length !== 1) return null;
  const answer = back.trim();
  if (!answer) return null;
  return front.replace(UNDERSCORE_BLANK_RE, `{{c1::${answer}}}`);
}

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function backAnswerText(back: unknown): string {
  if (typeof back === "string") return back;
  if (
    typeof back === "object" &&
    back != null &&
    "answer" in back &&
    typeof (back as { answer: unknown }).answer === "string"
  ) {
    return (back as { answer: string }).answer;
  }
  return "";
}

function occlusionRevealAnswer(
  region: { label: string },
  fallback: string,
): string {
  const label = region.label.trim();
  return label || fallback;
}

function parseOcclusionFront(front: unknown): OcclusionFront | null {
  if (typeof front !== "object" || front == null) return null;
  const raw = front as Record<string, unknown>;
  if (typeof raw.image_key !== "string" || !raw.image_key.trim()) return null;
  if (raw.mode !== "hide_one") return null;
  if (!Array.isArray(raw.regions)) return null;
  const regions: OcclusionRegion[] = [];
  for (const item of raw.regions) {
    if (typeof item !== "object" || item == null) return null;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string") return null;
    if (
      typeof r.x !== "number" ||
      typeof r.y !== "number" ||
      typeof r.w !== "number" ||
      typeof r.h !== "number"
    ) {
      return null;
    }
    if (typeof r.label !== "string") return null;
    regions.push({
      id: r.id,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      label: r.label,
    });
  }
  return {
    image_key: raw.image_key,
    mode: "hide_one",
    regions,
    prompt: typeof raw.prompt === "string" ? raw.prompt : undefined,
  };
}

function occlusionImageHtml(
  imageKey: string,
  region: OcclusionRegion,
  kind: "mask" | "outline",
): string {
  const src = encodeURIComponent(imageKey);
  const box =
    kind === "mask"
      ? `position:absolute;left:${pct(region.x)};top:${pct(region.y)};width:${pct(region.w)};height:${pct(region.h)};background:rgba(0,0,0,.85);border-radius:4px`
      : `position:absolute;left:${pct(region.x)};top:${pct(region.y)};width:${pct(region.w)};height:${pct(region.h)};border:2px solid #f57c00;border-radius:4px;box-sizing:border-box`;
  return (
    `<div style="position:relative;display:inline-block;max-width:100%">` +
    `<img src="${src}" style="max-width:100%;height:auto">` +
    `<div style="${box}"></div>` +
    `</div>`
  );
}

function occlusionToAnkiNotes(card: CardForAnkiNote): AnkiNotesResult {
  const front = parseOcclusionFront(card.front);
  if (!front) {
    return { skip: true, reason: "occlusion-invalid-front" };
  }
  if (front.regions.length === 0) {
    return { skip: true, reason: "occlusion-no-regions" };
  }
  const fallback = backAnswerText(card.back);
  return front.regions.map((region) => {
    const answer = escapeHtml(occlusionRevealAnswer(region, fallback));
    return {
      model: "sugarplum_occlusion" as const,
      fields: {
        Front: occlusionImageHtml(front.image_key, region, "mask"),
        Back:
          occlusionImageHtml(front.image_key, region, "outline") +
          `<br>${answer}`,
      },
    };
  });
}

export function cardToAnkiNote(card: CardForAnkiNote): AnkiNoteResult {
  const front = fieldText(card.front);
  const back = fieldText(card.back);
  if (front == null || back == null) {
    return { skip: true, reason: "non-string-fields" };
  }

  switch (card.type) {
    case "qa":
    case "image_label":
    case "diagram":
      return {
        model: "basic",
        fields: { Front: front, Back: back },
      };
    case "cloze": {
      const text = convertUnderscoreCloze(front, back) ?? front;
      if (!ANKI_CLOZE_RE.test(text) && UNDERSCORE_BLANK_RE.test(front)) {
        return { skip: true, reason: "cloze-underscore-unconvertible" };
      }
      if (!ANKI_CLOZE_RE.test(text)) {
        return { skip: true, reason: "cloze-missing-deletion" };
      }
      return {
        model: "cloze",
        fields: { Text: text, Extra: back },
      };
    }
    case "mcq":
      return {
        model: "sugarplum_mcq",
        fields: {
          Front: front,
          Options: (card.options ?? []).join("\n"),
          Answer: back,
        },
      };
    case "occlusion":
      return { skip: true, reason: "occlusion-use-cardToAnkiNotes" };
    default:
      return { skip: true, reason: `unsupported-type:${card.type}` };
  }
}

/** Expand a Sugarplum card into one or more Anki notes (occlusion → per region). */
export function cardToAnkiNotes(card: CardForAnkiNote): AnkiNotesResult {
  if (card.type === "occlusion") {
    return occlusionToAnkiNotes(card);
  }
  const one = cardToAnkiNote(card);
  if ("skip" in one) return one;
  return [one];
}
