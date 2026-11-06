import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import { parseOptionalJsonBody } from "../../worker/optional-json";

describe("parseOptionalJsonBody", () => {
  it("returns undefined for a blank body", () => {
    expect(parseOptionalJsonBody("")).toBeUndefined();
    expect(parseOptionalJsonBody("  \n")).toBeUndefined();
  });

  it("keeps a JSON null root distinct from a blank body", () => {
    expect(parseOptionalJsonBody("null")).toBeNull();
  });

  it("returns the parsed value", () => {
    expect(parseOptionalJsonBody('{"topicHints":["a"]}')).toEqual({
      topicHints: ["a"],
    });
  });

  it("rejects malformed JSON", () => {
    expect(() => parseOptionalJsonBody("{")).toThrow(HTTPException);
    try {
      parseOptionalJsonBody("{");
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(400);
      expect((err as HTTPException).message).toBe("Invalid JSON body");
    }
  });
});
