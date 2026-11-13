import { describe, expect, it } from "vitest";
import {
  anatomyHubHref,
  anatomySceneHref,
  canonicalAnatomySceneId,
  matchAnatomyPath,
  regionsFromSearch,
} from "../../src/anatomy/paths";
import { ANATOMY_TEACHING_ENTRIES, teachingEntryHref } from "../../src/anatomy/teachingEntries";

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

describe("teaching entries", () => {
  it("deep-links cover canine limb+skull, equine muscles/nerves, bovine limbs/skull-ribs", () => {
    const byId = Object.fromEntries(
      ANATOMY_TEACHING_ENTRIES.map((e) => [e.id, e]),
    );
    expect(byId["canine-limbs"]?.regions).toContain("legs-right-back");
    expect(byId["canine-skull"]?.regions).toEqual(["skull"]);
    expect(byId["equine-muscles"]?.regions).toContain("muscles");
    expect(byId["equine-nerves"]?.regions.length).toBeGreaterThan(0);
    expect(byId["bovine-limbs"]?.regions).toEqual(
      expect.arrayContaining(["back-legs", "front-legs"]),
    );
    expect(byId["bovine-skull-ribs"]?.regions).toEqual(
      expect.arrayContaining(["skull-cervical", "ribs-spine"]),
    );
    expect(teachingEntryHref(byId["canine-skull"]!)).toBe(
      "/anatomy/canine?region=skull",
    );
  });

  it("region ids exist on the shipped scene manifests", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    for (const entry of ANATOMY_TEACHING_ENTRIES) {
      const raw = readFileSync(
        resolve(process.cwd(), `public/anatomy/${entry.sceneId}/scene.json`),
        "utf8",
      );
      const regions =
        (JSON.parse(raw) as { regions?: { id: string }[] }).regions ?? [];
      const known = new Set(regions.map((r) => r.id));
      for (const id of entry.regions) {
        expect(known.has(id), `${entry.id} unknown region ${id}`).toBe(true);
      }
    }
  });
});

describe("canonicalAnatomySceneId", () => {
  it("maps legacy canine-limb to canine", () => {
    expect(canonicalAnatomySceneId("canine-limb")).toBe("canine");
    expect(canonicalAnatomySceneId("canine")).toBe("canine");
    expect(canonicalAnatomySceneId("equine")).toBe("equine");
  });
});
