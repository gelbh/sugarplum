import { describe, expect, it } from "vitest";
import {
  anatomyClipChrome,
  anatomyViewerMobile,
} from "../../src/anatomy/viewerLayout";

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

describe("anatomyClipChrome", () => {
  it("shows desktop ClipBar when not mobile and has clips", () => {
    expect(anatomyClipChrome(false, true)).toEqual({
      showClipBar: true,
      showClipsTrigger: false,
    });
  });

  it("shows mobile Clips trigger when mobile and has clips", () => {
    expect(anatomyClipChrome(true, true)).toEqual({
      showClipBar: false,
      showClipsTrigger: true,
    });
  });

  it("hides both when no clips", () => {
    expect(anatomyClipChrome(true, false)).toEqual({
      showClipBar: false,
      showClipsTrigger: false,
    });
    expect(anatomyClipChrome(false, false)).toEqual({
      showClipBar: false,
      showClipsTrigger: false,
    });
  });
});
