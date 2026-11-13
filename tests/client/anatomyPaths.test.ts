import { describe, expect, it } from "vitest";
import {
  anatomyHubHref,
  anatomySceneHref,
  canonicalAnatomySceneId,
  matchAnatomyPath,
  regionsFromSearch,
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

  it("appends region query params", () => {
    expect(anatomySceneHref("canine", { regions: ["skull"] })).toBe(
      "/anatomy/canine?region=skull",
    );
    expect(
      anatomySceneHref("bovine", {
        regions: ["skull-cervical", "ribs-spine"],
      }),
    ).toBe("/anatomy/bovine?region=skull-cervical&region=ribs-spine");
  });
});

describe("regionsFromSearch", () => {
  it("reads repeated region params", () => {
    expect(regionsFromSearch("?region=skull&region=spine")).toEqual([
      "skull",
      "spine",
    ]);
    expect(regionsFromSearch("")).toEqual([]);
    expect(regionsFromSearch("?other=1")).toEqual([]);
  });
});

describe("canonicalAnatomySceneId", () => {
  it("maps legacy canine-limb to canine", () => {
    expect(canonicalAnatomySceneId("canine-limb")).toBe("canine");
    expect(canonicalAnatomySceneId("canine")).toBe("canine");
    expect(canonicalAnatomySceneId("equine")).toBe("equine");
  });
});
