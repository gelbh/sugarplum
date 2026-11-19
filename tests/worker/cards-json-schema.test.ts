import { describe, expect, it } from "vitest";
import {
  JSON_OBJECT_RESPONSE_FORMAT,
  openAiClaimsJsonSchemaResponseFormat,
  openAiJsonSchemaResponseFormat,
  responseFormatForJsonShape,
  workersAiClaimsJsonSchemaResponseFormat,
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

  it("builds claims json_schema with required subject/predicate/source_span", () => {
    const openai = openAiClaimsJsonSchemaResponseFormat();
    const workers = workersAiClaimsJsonSchemaResponseFormat();
    expect(workers).toEqual(openai);
    expect(openai.json_schema.name).toBe("claim_drafts");
    expect(openai.json_schema.strict).toBe(false);
    expect(openai.json_schema.schema).toMatchObject({
      type: "object",
      required: ["claims"],
    });
    const claim = openai.json_schema.schema.properties.claims.items;
    expect(claim.required).toEqual(["subject", "predicate", "source_span"]);
  });

  it("responseFormatForJsonShape picks cards, claims, or json_object", () => {
    expect(responseFormatForJsonShape("cards")).toEqual(
      openAiJsonSchemaResponseFormat(),
    );
    expect(responseFormatForJsonShape("claims")).toEqual(
      openAiClaimsJsonSchemaResponseFormat(),
    );
    expect(responseFormatForJsonShape("object")).toEqual(
      JSON_OBJECT_RESPONSE_FORMAT,
    );
    expect(responseFormatForJsonShape()).toEqual(
      openAiJsonSchemaResponseFormat(),
    );
  });
});
