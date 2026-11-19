import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/api/client";
import {
  VIEW_AS_ATLAS_EMPTY,
  atlasOpenErrorMessage,
} from "../../src/atlas/atlasOpenCopy";

describe("atlasOpenErrorMessage", () => {
  it("maps view-as RO 403 to empty atlas copy", () => {
    expect(
      atlasOpenErrorMessage(
        new ApiError(403, "Read-only while viewing as user"),
      ),
    ).toBe(VIEW_AS_ATLAS_EMPTY);
  });

  it("keeps other ApiError messages", () => {
    expect(atlasOpenErrorMessage(new ApiError(500, "boom"))).toBe("boom");
  });

  it("falls back for non-ApiError", () => {
    expect(atlasOpenErrorMessage(new Error("x"))).toBe(
      "Could not open the Atlas",
    );
  });
});
