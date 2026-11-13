import { describe, expect, it } from "vitest";
import {
  anatomyHubHref,
  anatomySceneHref,
  canonicalAnatomySceneId,
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

  it("rejects malformed percent-encoding", () => {
    expect(matchAnatomyPath("/anatomy/%")).toBeNull();
  });

  it("rejects path traversal scene ids", () => {
    expect(matchAnatomyPath("/anatomy/..")).toBeNull();
    expect(matchAnatomyPath("/anatomy/%2e%2e")).toBeNull();
  });
});

describe("anatomy hrefs", () => {
  it("builds hub and scene hrefs", () => {
    expect(anatomyHubHref()).toBe("/anatomy");
    expect(anatomySceneHref("spike-limb")).toBe("/anatomy/spike-limb");
  });
});

describe("canonicalAnatomySceneId", () => {
  it("maps legacy canine-limb to canine", () => {
    expect(canonicalAnatomySceneId("canine-limb")).toBe("canine");
    expect(canonicalAnatomySceneId("canine")).toBe("canine");
    expect(canonicalAnatomySceneId("equine")).toBe("equine");
  });
});
