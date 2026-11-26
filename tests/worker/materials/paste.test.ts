import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import { parsePasteMaterialBody } from "../../../worker/materials/paste-material";

describe("parsePasteMaterialBody", () => {
  it("returns trimmed paste fields with default lecture role", () => {
    const parsed = parsePasteMaterialBody({
      text: "hello notes",
      filename: " Lecture.txt ",
      topicHints: ["renal"],
      source_role: "notes",
    });
    expect(parsed.text).toBe("hello notes");
    expect(parsed.filename).toBe("Lecture.txt");
    expect(parsed.topicHints).toEqual(["renal"]);
    expect(parsed.sourceRole).toBe("notes");
  });

  it("rejects empty text", () => {
    expect(() => parsePasteMaterialBody({ text: "   " })).toThrow(HTTPException);
    try {
      parsePasteMaterialBody({ text: "" });
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(400);
      expect((err as HTTPException).message).toBe("Text required");
    }
  });

  it("rejects oversized paste", () => {
    const text = "x".repeat(100 * 1024 + 1);
    try {
      parsePasteMaterialBody({ text });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(400);
      expect((err as HTTPException).message).toBe(
        "Paste must be 100KB or smaller",
      );
    }
  });
});
