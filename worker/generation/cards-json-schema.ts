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

const claimsDraftsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["subject", "predicate", "source_span"],
        properties: {
          subject: { type: "string" },
          predicate: { type: "string" },
          object: { type: "string" },
          qualifiers: {
            type: "array",
            items: { type: "string" },
          },
          source_span: { type: "string" },
          pages: {
            type: "array",
            items: { type: "number" },
          },
        },
      },
    },
  },
};

export type CompleteJsonShape = "cards" | "claims" | "object";

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

export function workersAiJsonSchemaResponseFormat(): ReturnType<
  typeof openAiJsonSchemaResponseFormat
> {
  return openAiJsonSchemaResponseFormat();
}

export function openAiClaimsJsonSchemaResponseFormat(): {
  type: "json_schema";
  json_schema: {
    name: "claim_drafts";
    strict: false;
    schema: typeof claimsDraftsSchema;
  };
} {
  return {
    type: "json_schema",
    json_schema: {
      name: "claim_drafts",
      // strict: false: optional object / qualifiers / pages.
      strict: false,
      schema: claimsDraftsSchema,
    },
  };
}

export function workersAiClaimsJsonSchemaResponseFormat(): ReturnType<
  typeof openAiClaimsJsonSchemaResponseFormat
> {
  return openAiClaimsJsonSchemaResponseFormat();
}

export const JSON_OBJECT_RESPONSE_FORMAT = { type: "json_object" } as const;

/** Pick OpenAI / Workers AI response_format for complete()/runChat. */
export function responseFormatForJsonShape(
  shape: CompleteJsonShape = "cards",
):
  | ReturnType<typeof openAiJsonSchemaResponseFormat>
  | ReturnType<typeof openAiClaimsJsonSchemaResponseFormat>
  | typeof JSON_OBJECT_RESPONSE_FORMAT {
  if (shape === "object") return JSON_OBJECT_RESPONSE_FORMAT;
  if (shape === "claims") return openAiClaimsJsonSchemaResponseFormat();
  return openAiJsonSchemaResponseFormat();
}
