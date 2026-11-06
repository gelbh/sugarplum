import { describe, expect, it } from "vitest";
import {
  JSON_OBJECT_RESPONSE_FORMAT,
  openAiJsonSchemaResponseFormat,
  workersAiJsonSchemaResponseFormat,
} from "../../worker/generation/cards-json-schema";

describe("cards json schema", () => {
  it("builds the OpenAI wrapper and the Cloudflare bare schema", () => {
    const openai = openAiJsonSchemaResponseFormat();
    const workers = workersAiJsonSchemaResponseFormat();
    expect(openai.type).toBe("json_schema");
    expect(openai.json_schema.name).toBe("card_drafts");
    expect(openai.json_schema.strict).toBe(false);
    expect(workers.json_schema).toBe(openai.json_schema.schema);
    expect(workers.json_schema).toMatchObject({
      type: "object",
      required: ["cards"],
    });
    const card = (
      workers.json_schema as {
        properties: { cards: { items: { required: string[] } } };
      }
    ).properties.cards.items;
    expect(card.required).toEqual(["type", "front", "back", "provenance"]);
    expect(JSON_OBJECT_RESPONSE_FORMAT).toEqual({ type: "json_object" });
  });
});
