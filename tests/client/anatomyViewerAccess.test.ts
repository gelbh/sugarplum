import { describe, expect, it } from "vitest";
import { sessionAnatomyViewerEnabled } from "../../src/anatomy/viewer/anatomyViewerAccess";

describe("sessionAnatomyViewerEnabled", () => {
  it("true only when anatomy_viewer is true", () => {
    expect(sessionAnatomyViewerEnabled({ anatomy_viewer: true })).toBe(true);
    expect(sessionAnatomyViewerEnabled({ anatomy_viewer: false })).toBe(false);
    expect(sessionAnatomyViewerEnabled({})).toBe(false);
    expect(sessionAnatomyViewerEnabled(null)).toBe(false);
  });
});
