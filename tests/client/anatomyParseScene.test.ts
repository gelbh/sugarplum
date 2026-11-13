import { describe, expect, it } from "vitest";
import {
  parseAnatomySceneManifest,
  safeAnatomyRelativeAsset,
} from "../../src/anatomy/parseScene";

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
});

describe("safeAnatomyRelativeAsset", () => {
  it("strips ./ and rejects traversal", () => {
    expect(safeAnatomyRelativeAsset("./Femur.glb")).toBe("Femur.glb");
    expect(safeAnatomyRelativeAsset("../x.glb")).toBeNull();
    expect(safeAnatomyRelativeAsset("/abs.glb")).toBeNull();
  });
});
