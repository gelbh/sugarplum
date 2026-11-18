import { describe, expect, it } from "vitest";
import { friendlyJobError } from "../../src/draftReview/friendlyJobError";

const EMPTY_BASE =
  "Generation finished without usable cards from this material.";
const EMPTY_LO =
  "Generation finished without usable cards from this material. Learning objectives may not match grounded facts in this material. Try broader objectives, or generate without them.";

describe("friendlyJobError", () => {
  it("returns null for empty input", () => {
    expect(friendlyJobError(null)).toBeNull();
    expect(friendlyJobError(undefined)).toBeNull();
    expect(friendlyJobError("")).toBeNull();
  });

  it("rewrites storage-missing errors", () => {
    expect(friendlyJobError("R2 object missing: foo")).toContain(
      "not found in storage",
    );
    expect(friendlyJobError("blob not found in storage")).toContain(
      "not found in storage",
    );
  });

  it("rewrites known empty-generation errors to a shared base message", () => {
    expect(friendlyJobError("No schema-valid cards produced")).toBe(EMPTY_BASE);
    expect(
      friendlyJobError("No schema-valid cards in LLM output"),
    ).toBe(EMPTY_BASE);
    expect(
      friendlyJobError(
        "No flashcard drafts could be produced from this material.",
      ),
    ).toBe(EMPTY_BASE);
    expect(
      friendlyJobError("Generation produced no valid draft cards"),
    ).toBe(EMPTY_BASE);
    expect(friendlyJobError("Critique returned no cards")).toBe(EMPTY_BASE);
    expect(
      friendlyJobError("Critique returned no schema-valid cards"),
    ).toBe(EMPTY_BASE);
  });

  it("rewrites hinted empty-generation with LO guidance", () => {
    expect(
      friendlyJobError(
        "No flashcard drafts could be produced from this material for the given learning objectives.",
      ),
    ).toBe(EMPTY_LO);
  });

  it("does not treat critique non-JSON as empty generation", () => {
    expect(friendlyJobError("Critique returned non-JSON content")).toBe(
      "Critique returned non-JSON content",
    );
  });

  it("passes through other messages", () => {
    expect(friendlyJobError("timeout")).toBe("timeout");
  });
});
