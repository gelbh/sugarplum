import { describe, expect, it } from "vitest";
import { ApiError } from "../../../src/api/client";
import {
  VIEW_AS_ATLAS_EMPTY,
  VIEW_AS_READ_ONLY_CODE,
  atlasOpenErrorMessage,
} from "../../../src/atlas/hub/atlasOpenCopy";

describe("atlasOpenErrorMessage", () => {
  it("maps view-as RO 403 code to empty atlas copy", () => {
    expect(
      atlasOpenErrorMessage(
        new ApiError(
          403,
          "Read-only while viewing as user",
          VIEW_AS_READ_ONLY_CODE,
        ),
      ),
    ).toBe(VIEW_AS_ATLAS_EMPTY);
  });

  it("does not map message-only 403 to empty atlas copy", () => {
    expect(
      atlasOpenErrorMessage(
        new ApiError(403, "Read-only while viewing as user"),
      ),
    ).toBe("Read-only while viewing as user");
  });

  it("does not map a different code to empty atlas copy", () => {
    expect(
      atlasOpenErrorMessage(
        new ApiError(403, "Read-only while viewing as user", "OTHER"),
      ),
    ).toBe("Read-only while viewing as user");
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
