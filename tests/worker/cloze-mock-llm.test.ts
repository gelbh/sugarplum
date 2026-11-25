import { describe, it, expect } from "vitest";
import { assertSingleCloze } from "../../worker/generation/schema";
import { mockLlmAdapter } from "../../worker/generation/llm";

describe("mock LLM adapter", () => {
  it("returns 2 QA + 1 cloze", async () => {
    const drafts = await mockLlmAdapter().generateDrafts({
      text: "Mitochondria produce ATP in eukaryotic cells.",
      apiKey: "unused",
      provider: "mock",
    });
    expect(drafts.filter((d) => d.type === "qa")).toHaveLength(2);
    expect(drafts.filter((d) => d.type === "cloze")).toHaveLength(1);
    expect(() => assertSingleCloze(drafts[2]!.front)).not.toThrow();
  });
});
