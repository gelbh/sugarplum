import { describe, expect, it } from "vitest";
import {
  CARD_FROM_CLAIM_SYSTEM_PROMPT,
  cardFromClaimUserPrompt,
} from "../../worker/generation/card-from-claim-prompts";
import {
  CLAIM_EXTRACT_COMPACT_SYSTEM_PROMPT,
  CLAIM_EXTRACT_SYSTEM_PROMPT,
  claimExtractCompactUserPrompt,
  claimExtractUserPrompt,
} from "../../worker/generation/claim-prompts";
import {
  CRITIQUE_SYSTEM_PROMPT,
  critiqueUserPrompt,
} from "../../worker/generation/critique-prompts";
import {
  GENERATE_COMPACT_SYSTEM_PROMPT,
  GENERATE_SYSTEM_PROMPT,
  IMAGE_GENERATE_SYSTEM_PROMPT,
  generateUserPrompt,
} from "../../worker/generation/prompts";
import type { StudyClaim } from "../../worker/generation/claims";
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
    expect(p).toMatch(/restate|restates/);
    expect(p).toMatch(/no\s+new\s+fact|adds?\s+no\s+new/);
    expect(p).toMatch(/cited excerpt alone/);
    assertNoAlwaysRewrite(CRITIQUE_SYSTEM_PROMPT);
  });

  it("critique user prompt reinforces drop bias and grounding", () => {
    const user = critiqueUserPrompt("source text", sample).toLowerCase();
    expect(user).toMatch(/drop/);
    expect(user).toMatch(/ground|excerpt|entail/);
    expect(user).toMatch(/prefer\s+drop|do\s+not\s+speculate|cheap\s+fix/);
    expect(user).toMatch(/restate|restates/);
    expect(user).toMatch(/no\s+new\s+fact|adds?\s+no\s+new/);
    expect(user).toMatch(/cited excerpt alone/);
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
      expect(p).toMatch(
        /skip|omit|do\s+not\s+invent|only\s+(facts|cards)\s+(clearly|clearly\s+)?(?:in|from)|drop/,
      );
      expect(p).toMatch(/atomic|one\s+atomic/);
      assertNoAlwaysRewrite(prompt);
    }
  });

  it("generate text prompts require covering distinct grounded facts", () => {
    for (const prompt of [
      GENERATE_SYSTEM_PROMPT,
      GENERATE_COMPACT_SYSTEM_PROMPT,
    ]) {
      expect(prompt.toLowerCase()).toMatch(
        /cover distinct grounded facts|do not collapse multiple facts/,
      );
    }
  });

  it("generate text prompts skip document LO lists, not user learning objectives", () => {
    for (const prompt of [
      GENERATE_SYSTEM_PROMPT,
      GENERATE_COMPACT_SYSTEM_PROMPT,
      generateUserPrompt("sample"),
    ]) {
      const p = prompt.toLowerCase();
      expect(p).toMatch(/document (learning-?objective|objective)/);
      expect(p).toMatch(/optional suffix|user learning objective/);
    }
  });

  it("generate prompts allow mcq with grounded distractors", () => {
    for (const prompt of [
      GENERATE_SYSTEM_PROMPT,
      GENERATE_COMPACT_SYSTEM_PROMPT,
    ]) {
      const p = prompt.toLowerCase();
      expect(p).toMatch(/\bmcq\b/);
      expect(p).toMatch(/options/);
      expect(p).toMatch(/3.?5|3–5/);
      expect(p).toMatch(/distractor/);
      expect(p).toMatch(/entail|present\s+in\s+the\s+cited/);
      expect(p).toMatch(/do\s+not\s+invent|ungrounded|trivia/);
    }
  });

  it("critique prompts drop invalid or ungrounded mcq", () => {
    const sys = CRITIQUE_SYSTEM_PROMPT.toLowerCase();
    expect(sys).toMatch(/\bmcq\b/);
    expect(sys).toMatch(/distractor|options/);
    expect(sys).toMatch(/ambiguous/);
    expect(sys).toMatch(/entail|present\s+in\s+the\s+cited/);
    expect(sys).toMatch(/not\s+among|missing\s+from\s+options|one\s+of\s+them/);

    const user = critiqueUserPrompt("source", sample).toLowerCase();
    expect(user).toMatch(/\bmcq\b/);
    expect(user).toMatch(/distractor|ungrounded/);
    expect(user).toMatch(/ambiguous/);
    expect(user).toMatch(/not\s+among|among\s+the\s+options/);
  });

  it("generate and critique prompts treat cloze Extra/back as optional", () => {
    for (const prompt of [
      GENERATE_SYSTEM_PROMPT,
      GENERATE_COMPACT_SYSTEM_PROMPT,
      CRITIQUE_SYSTEM_PROMPT,
    ]) {
      const p = prompt.toLowerCase();
      expect(p).toMatch(/extra|optional/);
      expect(p).toMatch(/cloze/);
      expect(p).toMatch(/empty|omit|optional/);
    }
    const user = critiqueUserPrompt("source", sample).toLowerCase();
    expect(user).toMatch(/extra|optional|empty/);
  });
});

/** Organism / taxon / cloze-topic / single-fact MCQ phrases (post-regen PR2). */
function assertOrganismClozeMcqPhrases(text: string) {
  const p = text.toLowerCase();
  // one organism / do not AND-merge distinct species into one stem
  expect(p).toMatch(/one\s+organism/);
  expect(p).toMatch(
    /and[-\s]?merge|do\s+not\s+.*(?:merge|combine).*species|distinct\s+species/,
  );
  // front taxon supported by excerpt / misattributed table row → drop
  expect(p).toMatch(/taxon/);
  expect(p).toMatch(/excerpt/);
  expect(p).toMatch(/misattribut/);
  // cloze blanks a high-yield fact, not the topic genus
  expect(p).toMatch(/cloze/);
  expect(p).toMatch(
    /high[-\s]?yield\s+fact|blanks?\s+a\s+(?:high[-\s]?yield\s+)?fact/,
  );
  expect(p).toMatch(/topic\s+genus|not\s+(?:the\s+)?(?:topic\s+)?genus/);
  // MCQ single-fact stem (no multi-species AND)
  expect(p).toMatch(/\bmcq\b/);
  expect(p).toMatch(/single[-\s]?fact/);
  expect(p).toMatch(/multi[-\s]?species|species.*\band\b|\band\b.*species/);
}

describe("organism / cloze / mcq prompt phrases (post-regen)", () => {
  it("generate system requires one-organism, taxon grounding, cloze topic, single-fact mcq", () => {
    assertOrganismClozeMcqPhrases(GENERATE_SYSTEM_PROMPT);
  });

  it("generate compact requires one-organism, taxon grounding, cloze topic, single-fact mcq", () => {
    assertOrganismClozeMcqPhrases(GENERATE_COMPACT_SYSTEM_PROMPT);
  });

  it("critique system drops AND-merge, misattributed taxon, topic-genus cloze, multi-fact mcq", () => {
    assertOrganismClozeMcqPhrases(CRITIQUE_SYSTEM_PROMPT);
  });

  it("critique user reinforces organism, taxon, cloze-topic, and single-fact mcq drops", () => {
    assertOrganismClozeMcqPhrases(critiqueUserPrompt("source text", sample));
  });
});

const sampleClaim: StudyClaim = {
  subject: "Lysozyme",
  predicate: "digests peptidoglycan in bacterial cell walls",
  object: "peptidoglycan",
  source_span: "Lysozyme digests peptidoglycan in bacterial cell walls",
};

describe("claim extract prompt phrases", () => {
  it("extract system requires atomic claims, pronoun resolve, split compounds, skip chrome", () => {
    for (const prompt of [
      CLAIM_EXTRACT_SYSTEM_PROMPT,
      CLAIM_EXTRACT_COMPACT_SYSTEM_PROMPT,
    ]) {
      const p = prompt.toLowerCase();
      expect(p).toMatch(/atomic\s+claim|one\s+(?:atomic\s+)?(?:fact|assertion)/);
      expect(p).toMatch(/resolve\s+pronoun|pronoun/);
      expect(p).toMatch(/split\s+compound|two\s+claims|compound/);
      expect(p).toMatch(
        /learning[-\s]?objective|table\s+of\s+contents|references|slide\s+chrome|chrome/,
      );
      expect(p).toMatch(/ground|source|span/);
      expect(p).toMatch(/claims/);
      assertNoAlwaysRewrite(prompt);
    }
  });

  it("extract user prompts include material and claim instructions", () => {
    for (const user of [
      claimExtractUserPrompt("sample material"),
      claimExtractCompactUserPrompt("sample material"),
    ]) {
      const p = user.toLowerCase();
      expect(p).toMatch(/sample material/);
      expect(p).toMatch(/claim/);
      expect(p).toMatch(/material/);
    }
  });
});

describe("card-from-claim prompt phrases", () => {
  it("write system: one card per claim, short backs, prefer qa/cloze, mcq closed set, no compound stems", () => {
    const p = CARD_FROM_CLAIM_SYSTEM_PROMPT.toLowerCase();
    expect(p).toMatch(/one\s+card\s+per\s+claim|at\s+most\s+one\s+card/);
    expect(p).toMatch(/25\s+words|under\s+~?25/);
    expect(p).toMatch(/\bqa\b/);
    expect(p).toMatch(/cloze/);
    expect(p).toMatch(/\bmcq\b/);
    expect(p).toMatch(/closed\s+(?:option\s+)?set|option\s+set|listed\s+.*options?/);
    expect(p).toMatch(
      /compound\s+stem|and\s+what|versus|no\s+compound/,
    );
    expect(p).toMatch(/omit|skip/);
    assertNoAlwaysRewrite(CARD_FROM_CLAIM_SYSTEM_PROMPT);
  });

  it("write user includes claims JSON and card instructions", () => {
    const user = cardFromClaimUserPrompt([sampleClaim]).toLowerCase();
    expect(user).toMatch(/lysozyme/);
    expect(user).toMatch(/claim/);
    expect(user).toMatch(/card|flashcard/);
  });
});
