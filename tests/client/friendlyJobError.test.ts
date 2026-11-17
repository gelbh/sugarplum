import { describe, expect, it } from "vitest";
import { friendlyJobError } from "../../src/draftReview/friendlyJobError";

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

  it("rewrites schema-valid empty generation", () => {
    expect(friendlyJobError("No schema-valid cards produced")).toContain(
      "without usable cards",
    );
  });

  it("passes through other messages", () => {
    expect(friendlyJobError("timeout")).toBe("timeout");
  });
});
