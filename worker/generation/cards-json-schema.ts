const cardDraftsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "front", "back", "provenance"],
        properties: {
          type: {
            type: "string",
            enum: ["qa", "cloze", "image_label", "diagram", "mcq"],
          },
          front: { type: "string" },
          back: { type: "string" },
          options: {
            type: "array",
            items: { type: "string" },
          },
          provenance: {
            type: "object",
            additionalProperties: false,
            required: ["pages", "excerpt"],
            properties: {
              pages: {
                type: "array",
                items: { type: "number" },
              },
              excerpt: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export function openAiJsonSchemaResponseFormat(): {
  type: "json_schema";
  json_schema: {
    name: "card_drafts";
    strict: false;
    schema: typeof cardDraftsSchema;
  };
} {
  return {
    type: "json_schema",
    json_schema: {
      name: "card_drafts",
      // strict: false because OpenAI strict mode would require the optional options field.
      strict: false,
      schema: cardDraftsSchema,
    },
  };
}

export function workersAiJsonSchemaResponseFormat(): {
  type: "json_schema";
  json_schema: typeof cardDraftsSchema;
} {
  return {
    type: "json_schema",
    json_schema: cardDraftsSchema,
  };
}

export const JSON_OBJECT_RESPONSE_FORMAT = { type: "json_object" } as const;
