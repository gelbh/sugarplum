import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import {
  parseMoveBody,
  parseRejectBody,
  parseRegenBody,
} from "../../worker/cards/card-action-bodies";

describe("parseRejectBody", () => {
  it("defaults reason to null", () => {
    expect(parseRejectBody({})).toEqual({ reason: null });
  });

  it("rejects invalid reason", () => {
    try {
      parseRejectBody({ reason: "not-a-reason" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(400);
    }
  });
});

describe("parseMoveBody", () => {
  it("requires deckId", () => {
    expect(parseMoveBody({ deckId: "deck-b" })).toEqual({ deckId: "deck-b" });
    try {
      parseMoveBody({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
    }
  });
});

describe("parseRegenBody", () => {
  it("accepts regen type", () => {
    expect(parseRegenBody({ type: "qa" }).type).toBe("qa");
  });

  it("rejects missing type", () => {
    try {
      parseRegenBody({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
    }
  });
});
