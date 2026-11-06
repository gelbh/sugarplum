import { describe, expect, it } from "vitest";
import {
  JSON_OBJECT_RESPONSE_FORMAT,
  openAiJsonSchemaResponseFormat,
  workersAiJsonSchemaResponseFormat,
} from "../../worker/generation/cards-json-schema";

describe("cards json schema", () => {
  it("builds one json_schema wrapper for OpenAI and Workers AI", () => {
    const openai = openAiJsonSchemaResponseFormat();
    const workers = workersAiJsonSchemaResponseFormat();
    expect(workers).toEqual(openai);
    expect(openai.json_schema.name).toBe("card_drafts");
    expect(openai.json_schema.strict).toBe(false);
    expect(openai.json_schema.schema).toMatchObject({
      type: "object",
      required: ["cards"],
    });
    const card = openai.json_schema.schema.properties.cards.items;
    expect(card.required).toEqual(["type", "front", "back", "provenance"]);
    expect(JSON_OBJECT_RESPONSE_FORMAT).toEqual({ type: "json_object" });
  });
});
