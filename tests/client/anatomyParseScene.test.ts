import { describe, expect, it } from "vitest";
import { parseAnatomySceneManifest } from "../../src/anatomy/parseScene";

describe("parseAnatomySceneManifest", () => {
  it("accepts a minimal valid manifest", () => {
    const m = parseAnatomySceneManifest({
      id: "spike-limb",
      title: "Spike limb (stand-in)",
      asset: "./model.gltf",
      structures: [{ id: "bone-a", label: "Bone A", node: "BoneA" }],
    });
    expect(m.id).toBe("spike-limb");
    expect(m.structures).toHaveLength(1);
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
