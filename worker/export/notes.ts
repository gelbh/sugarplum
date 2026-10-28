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

function fieldText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return String(value);
}

export function cardToAnkiNote(card: CardForAnkiNote): AnkiNoteResult {
  const front = fieldText(card.front);
  const back = fieldText(card.back);

  switch (card.type) {
    case "qa":
    case "image_label":
    case "diagram":
      return {
        model: "basic",
        fields: { Front: front, Back: back },
      };
    case "cloze":
      return {
        model: "cloze",
        fields: { Text: front, Extra: back },
      };
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
      return { skip: true, reason: "occlusion-phase3" };
    default:
      return { skip: true, reason: `unsupported-type:${card.type}` };
  }
}
