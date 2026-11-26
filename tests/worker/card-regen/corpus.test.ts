import { describe, it, expect } from "vitest";
import { resolveRegenCorpus } from "../../../worker/generation/card-regen";
import { CHUNK_CHAR_LIMIT } from "../../../worker/generation/pipeline";

describe("resolveRegenCorpus", () => {
  it("prefers a non-empty excerpt over material text", () => {
    expect(
      resolveRegenCorpus({
        excerpt: "  ATP stores energy  ",
        materialText:
          "Long material about many facts including ATP stores energy and more.",
      }),
    ).toBe("ATP stores energy");
  });

  it("falls back to capped material when excerpt is empty", () => {
    const material = "x".repeat(CHUNK_CHAR_LIMIT + 50);
    expect(resolveRegenCorpus({ excerpt: "   ", materialText: material })).toBe(
      material.slice(0, CHUNK_CHAR_LIMIT),
    );
  });
});
