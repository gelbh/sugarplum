export type AnkiNoteSpec = {
  model: "basic" | "cloze" | "sugarplum_mcq";
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

const ANKI_CLOZE_RE = /\{\{c\d+::[\s\S]*?\}\}/;
const UNDERSCORE_BLANK_RE = /_{3,}/;

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

export function cardToAnkiNote(card: CardForAnkiNote): AnkiNoteResult {
  if (card.type === "occlusion") {
    return { skip: true, reason: "occlusion-phase3" };
  }

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
    default:
      return { skip: true, reason: `unsupported-type:${card.type}` };
  }
}
