import { describe, expect, it } from "vitest";
import {
  CRITIQUE_SYSTEM_PROMPT,
  critiqueUserPrompt,
} from "../../worker/generation/critique-prompts";
import {
  GENERATE_COMPACT_SYSTEM_PROMPT,
  GENERATE_SYSTEM_PROMPT,
  IMAGE_GENERATE_SYSTEM_PROMPT,
} from "../../worker/generation/prompts";
import type { CardDraft } from "../../worker/generation/schema";

const sample: CardDraft[] = [
  {
    type: "qa",
    front: "What is ATP?",
    back: "Adenosine triphosphate",
    provenance: { pages: [1], excerpt: "ATP" },
  },
];

function assertNoAlwaysRewrite(text: string) {
  expect(text.toLowerCase()).not.toMatch(/always\s+rewrite/);
  expect(text.toLowerCase()).not.toMatch(/rewrite\s+every/);
  expect(text.toLowerCase()).not.toMatch(/never\s+drop/);
}

describe("drop-biased quality prompts (5B)", () => {
  it("critique system prefers drop + grounding over speculative rewrite", () => {
    const p = CRITIQUE_SYSTEM_PROMPT.toLowerCase();
    expect(p).toMatch(/prefer\s+drop/);
    expect(p).toMatch(/ground/);
    expect(p).toMatch(/table/);
    expect(p).toMatch(/fragment/);
    expect(p).toMatch(/entail|not\s+in\s+the\s+(source|excerpt)|ungrounded/);
    expect(p).toMatch(/cloze/);
    expect(p).toMatch(/back.*(?:equal|same|duplicat)|may\s+equal/);
    assertNoAlwaysRewrite(CRITIQUE_SYSTEM_PROMPT);
  });

  it("critique user prompt reinforces drop bias and grounding", () => {
    const user = critiqueUserPrompt("source text", sample).toLowerCase();
    expect(user).toMatch(/drop/);
    expect(user).toMatch(/ground|excerpt|entail/);
    expect(user).toMatch(/prefer\s+drop|do\s+not\s+speculate|cheap\s+fix/);
    assertNoAlwaysRewrite(user);
  });

  it("generate system prompts require grounding and skip weak cards", () => {
    for (const prompt of [
      GENERATE_SYSTEM_PROMPT,
      GENERATE_COMPACT_SYSTEM_PROMPT,
      IMAGE_GENERATE_SYSTEM_PROMPT,
    ]) {
      const p = prompt.toLowerCase();
      expect(p).toMatch(/ground|excerpt|source/);
      expect(p).toMatch(/skip|omit|do\s+not\s+invent|only\s+(facts|cards)\s+(clearly|clearly\s+)?(?:in|from)|drop/);
      expect(p).toMatch(/atomic|one\s+atomic/);
      assertNoAlwaysRewrite(prompt);
    }
  });
});
