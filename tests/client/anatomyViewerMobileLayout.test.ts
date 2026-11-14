import { describe, expect, it } from "vitest";
import { anatomyViewerMobile } from "../../src/anatomy/viewerLayout";

describe("anatomyViewerMobile", () => {
  it("hides rail and shows sheet triggers on mobile", () => {
    expect(anatomyViewerMobile(true)).toEqual({
      showRail: false,
      showSheetTriggers: true,
    });
  });

  it("shows rail on desktop", () => {
    expect(anatomyViewerMobile(false)).toEqual({
      showRail: true,
      showSheetTriggers: false,
    });
  });
});
