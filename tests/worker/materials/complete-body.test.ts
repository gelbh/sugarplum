import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import { parseCompleteMaterialBody } from "../../../worker/materials/complete-body";

describe("parseCompleteMaterialBody", () => {
  it("returns defaults for empty body", () => {
    const parsed = parseCompleteMaterialBody("", "pdf");
    expect(parsed).toEqual({
      figureExtractMode: undefined,
      topicHints: null,
      attachOnly: false,
      ocrPages: undefined,
    });
  });

  it("parses attachOnly and figureExtractMode", () => {
    const parsed = parseCompleteMaterialBody(
      JSON.stringify({
        attachOnly: true,
        figureExtractMode: "accurate",
        topicHints: ["renal"],
      }),
      "pdf",
    );
    expect(parsed.attachOnly).toBe(true);
    expect(parsed.figureExtractMode).toBe("accurate");
    expect(parsed.topicHints).toEqual(["renal"]);
  });

  it("rejects invalid figureExtractMode", () => {
    try {
      parseCompleteMaterialBody(
        JSON.stringify({ figureExtractMode: "slow" }),
        "pdf",
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(400);
      expect((err as HTTPException).message).toBe("Invalid figureExtractMode");
    }
  });

  it("rejects ocrPages on non-pdf", () => {
    try {
      parseCompleteMaterialBody(
        JSON.stringify({
          ocrPages: [{ page: 1, text: "hi" }],
        }),
        "image",
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).message).toBe("Invalid ocrPages");
    }
  });
});
