import { describe, expect, it } from "vitest";
import {
  activeRegionIdsForOpen,
  defaultActiveRegionIds,
  parseAnatomySceneManifest,
  safeAnatomyRelativeAsset,
} from "../../../src/anatomy/viewer/parseScene";

describe("parseAnatomySceneManifest", () => {
  it("accepts a minimal single-asset manifest", () => {
    const m = parseAnatomySceneManifest({
      id: "spike-limb",
      title: "Spike limb",
      asset: "./model.gltf",
      structures: [{ id: "bone-a", label: "Bone A", node: "BoneA" }],
    });
    expect(m.id).toBe("spike-limb");
    expect(m.asset).toBe("./model.gltf");
    expect(m.structures).toHaveLength(1);
  });

  it("accepts multi-asset structures without top-level asset", () => {
    const m = parseAnatomySceneManifest({
      id: "canine-limb",
      title: "Canine pelvic limb (right)",
      structures: [
        {
          id: "femur",
          label: "Femur",
          node: "Femur",
          asset: "./Femur.glb",
        },
        {
          id: "tibia",
          label: "Tibia",
          node: "Tibia",
          asset: "./Tibia.glb",
        },
      ],
    });
    expect(m.asset).toBeUndefined();
    expect(m.structures[0].asset).toBe("./Femur.glb");
  });

  it("rejects mixed top-level and structure assets", () => {
    expect(() =>
      parseAnatomySceneManifest({
        id: "x",
        title: "X",
        asset: "./model.gltf",
        structures: [
          {
            id: "a",
            label: "A",
            node: "A",
            asset: "./A.glb",
          },
        ],
      }),
    ).toThrow(/mixed packaging/i);
  });

  it("rejects multi-asset with a structure missing asset", () => {
    expect(() =>
      parseAnatomySceneManifest({
        id: "x",
        title: "X",
        structures: [
          { id: "a", label: "A", node: "A", asset: "./A.glb" },
          { id: "b", label: "B", node: "B" },
        ],
      }),
    ).toThrow(/every structure/i);
  });

  it("rejects missing structures", () => {
    expect(() =>
      parseAnatomySceneManifest({
        id: "x",
        title: "X",
        asset: "./model.gltf",
      }),
    ).toThrow(/structures/i);
  });

  it("accepts regions with matching structure.region and nested assets", () => {
    const m = parseAnatomySceneManifest({
      id: "canine",
      title: "Canine",
      regions: [
        {
          id: "legs-right-back",
          label: "Legs · Right back",
          defaultActive: true,
        },
      ],
      structures: [
        {
          id: "femur",
          label: "Femur",
          node: "Femur",
          asset: "./Legs/Right_Back/Femur.glb",
          region: "legs-right-back",
        },
      ],
    });
    expect(m.regions).toHaveLength(1);
    expect(m.structures[0].region).toBe("legs-right-back");
    expect(defaultActiveRegionIds(m)).toEqual(["legs-right-back"]);
  });

  it("rejects structures missing region when regions are listed", () => {
    expect(() =>
      parseAnatomySceneManifest({
        id: "x",
        title: "X",
        regions: [{ id: "legs", label: "Legs" }],
        structures: [{ id: "a", label: "A", node: "A", asset: "./A.glb" }],
      }),
    ).toThrow(/require region/i);
  });

  it("rejects unknown structure.region", () => {
    expect(() =>
      parseAnatomySceneManifest({
        id: "x",
        title: "X",
        regions: [{ id: "legs", label: "Legs" }],
        structures: [
          {
            id: "a",
            label: "A",
            node: "A",
            asset: "./A.glb",
            region: "organs",
          },
        ],
      }),
    ).toThrow(/unknown region/i);
  });

  it("defaults active region to the first when none marked", () => {
    const m = parseAnatomySceneManifest({
      id: "x",
      title: "X",
      regions: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      structures: [
        {
          id: "s1",
          label: "S1",
          node: "S1",
          asset: "./a.glb",
          region: "a",
        },
      ],
    });
    expect(defaultActiveRegionIds(m)).toEqual(["a"]);
  });

  it("activeRegionIdsForOpen prefers known ?region= ids", () => {
    const m = parseAnatomySceneManifest({
      id: "x",
      title: "X",
      regions: [
        { id: "a", label: "A", defaultActive: true },
        { id: "b", label: "B" },
      ],
      structures: [
        {
          id: "s1",
          label: "S1",
          node: "S1",
          asset: "./a.glb",
          region: "a",
        },
        {
          id: "s2",
          label: "S2",
          node: "S2",
          asset: "./b.glb",
          region: "b",
        },
      ],
    });
    expect(activeRegionIdsForOpen(m, ["b", "nope"])).toEqual(["b"]);
    expect(activeRegionIdsForOpen(m, ["nope"])).toEqual(["a"]);
    expect(activeRegionIdsForOpen(m, [])).toEqual(["a"]);
  });

  it("accepts optional structure info summary and alsoKnownAs", () => {
    const m = parseAnatomySceneManifest({
      id: "x",
      title: "X",
      asset: "./model.gltf",
      structures: [
        {
          id: "femur",
          label: "Femur",
          node: "Femur",
          info: {
            summary: "Long bone of the thigh.",
            alsoKnownAs: ["thigh bone"],
          },
        },
        {
          id: "tibia",
          label: "Tibia",
          node: "Tibia",
          info: { summary: "Primary crus bone." },
        },
        {
          id: "fibula",
          label: "Fibula",
          node: "Fibula",
        },
      ],
    });
    expect(m.structures[0].info).toEqual({
      summary: "Long bone of the thigh.",
      alsoKnownAs: ["thigh bone"],
    });
    expect(m.structures[1].info).toEqual({ summary: "Primary crus bone." });
    expect(m.structures[2].info).toBeUndefined();
  });

  it("accepts info with only alsoKnownAs", () => {
    const m = parseAnatomySceneManifest({
      id: "x",
      title: "X",
      asset: "./model.gltf",
      structures: [
        {
          id: "patella",
          label: "Patella",
          node: "Patella",
          info: { alsoKnownAs: ["kneecap"] },
        },
      ],
    });
    expect(m.structures[0].info).toEqual({ alsoKnownAs: ["kneecap"] });
  });

  it("rejects non-object structure info", () => {
    expect(() =>
      parseAnatomySceneManifest({
        id: "x",
        title: "X",
        asset: "./model.gltf",
        structures: [
          {
            id: "a",
            label: "A",
            node: "A",
            info: "not-an-object",
          },
        ],
      }),
    ).toThrow(/info/i);
  });

  it("rejects alsoKnownAs that is not an array of strings", () => {
    expect(() =>
      parseAnatomySceneManifest({
        id: "x",
        title: "X",
        asset: "./model.gltf",
        structures: [
          {
            id: "a",
            label: "A",
            node: "A",
            info: { alsoKnownAs: "kneecap" },
          },
        ],
      }),
    ).toThrow(/alsoKnownAs|info/i);
  });

  it("accepts optional clips with defaults", () => {
    const m = parseAnatomySceneManifest({
      id: "clip-demo",
      title: "Clip demo",
      asset: "./model.glb",
      structures: [{ id: "root", label: "Root", node: "Root" }],
      clips: [
        { id: "walk", label: "Walk", animation: "Walk_baked" },
        {
          id: "falcine",
          label: "Falcine",
          animation: "BrainFalcineAnimation",
          loop: false,
          reveal: ["skull", "brain-falcine"],
        },
      ],
    });
    expect(m.clips).toHaveLength(2);
    expect(m.clips?.[0].loop).toBeUndefined();
    expect(m.clips?.[1].loop).toBe(false);
    expect(m.clips?.[1].reveal).toEqual(["skull", "brain-falcine"]);
  });

  it("rejects clip missing animation name", () => {
    expect(() =>
      parseAnatomySceneManifest({
        id: "x",
        title: "X",
        asset: "./m.glb",
        structures: [{ id: "a", label: "A", node: "A" }],
        clips: [{ id: "c", label: "C" }],
      }),
    ).toThrow();
  });
});

describe("safeAnatomyRelativeAsset", () => {
  it("strips ./ and rejects traversal", () => {
    expect(safeAnatomyRelativeAsset("./Femur.glb")).toBe("Femur.glb");
    expect(safeAnatomyRelativeAsset("./Legs/Right_Back/Femur.glb")).toBe(
      "Legs/Right_Back/Femur.glb",
    );
    expect(safeAnatomyRelativeAsset("../x.glb")).toBeNull();
    expect(safeAnatomyRelativeAsset("/abs.glb")).toBeNull();
  });
});
