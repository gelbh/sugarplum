import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFTS_FOR_LEARNING_OBJECTIVES,
  emptyDraftError,
} from "../../worker/generation/empty-draft-error";

describe("emptyDraftError", () => {
  it("returns the site base message when topicHints are absent", () => {
    expect(
      emptyDraftError(
        null,
        "No flashcard drafts could be produced from this material.",
      ),
    ).toBe("No flashcard drafts could be produced from this material.");
    expect(
      emptyDraftError(
        [],
        "Generation produced no valid draft cards",
      ),
    ).toBe("Generation produced no valid draft cards");
  });

  it("returns the locked LO message when topicHints are present", () => {
    expect(
      emptyDraftError(
        ["cranial nerves"],
        "No flashcard drafts could be produced from this material.",
      ),
    ).toBe(EMPTY_DRAFTS_FOR_LEARNING_OBJECTIVES);
    expect(
      emptyDraftError(
        ["focus on virulence"],
        "Generation produced no valid draft cards",
      ),
    ).toBe(EMPTY_DRAFTS_FOR_LEARNING_OBJECTIVES);
  });
});
