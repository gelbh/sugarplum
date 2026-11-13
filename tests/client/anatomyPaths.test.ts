import { describe, expect, it } from "vitest";
import {
  anatomyHubHref,
  anatomySceneHref,
  matchAnatomyPath,
} from "../../src/anatomy/paths";

describe("matchAnatomyPath", () => {
  it("matches hub", () => {
    expect(matchAnatomyPath("/anatomy")).toEqual({ kind: "hub" });
    expect(matchAnatomyPath("/anatomy/")).toEqual({ kind: "hub" });
  });

  it("matches scene", () => {
    expect(matchAnatomyPath("/anatomy/spike-limb")).toEqual({
      kind: "scene",
      sceneId: "spike-limb",
    });
  });

  it("rejects junk", () => {
    expect(matchAnatomyPath("/library")).toBeNull();
    expect(matchAnatomyPath("/anatomy/a/b")).toBeNull();
  });
});

describe("anatomy hrefs", () => {
  it("builds hub and scene hrefs", () => {
    expect(anatomyHubHref()).toBe("/anatomy");
    expect(anatomySceneHref("spike-limb")).toBe("/anatomy/spike-limb");
  });
});
