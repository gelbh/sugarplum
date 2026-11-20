import { describe, expect, it } from "vitest";
import { buildLoads } from "../../src/anatomy/viewer/anatomyViewerLoads";
import type { AnatomySceneManifest } from "../../src/anatomy/types";

const sharedAssetManifest = {
  id: "demo",
  title: "Demo",
  asset: "./scene.glb",
  regions: [
    { id: "a", label: "A", defaultActive: true },
    { id: "b", label: "B" },
  ],
  structures: [
    { id: "s1", label: "One", node: "n1", region: "a" },
    { id: "s2", label: "Two", node: "n2", region: "b" },
  ],
} satisfies AnatomySceneManifest;

const multiAssetManifest = {
  id: "multi",
  title: "Multi",
  structures: [
    { id: "s1", label: "One", node: "n1", asset: "./a.glb" },
    { id: "s2", label: "Two", node: "n2", asset: "./b.glb" },
  ],
} satisfies AnatomySceneManifest;

describe("buildLoads", () => {
  it("filters shared-asset structures by active regions", () => {
    const loads = buildLoads(
      "demo",
      sharedAssetManifest,
      new Set(["a"]),
    );
    expect(loads).toEqual([
      {
        structureId: "s1",
        url: "/anatomy/demo/scene.glb",
        node: "n1",
        region: "a",
        label: "One",
      },
    ]);
  });

  it("builds per-structure asset loads", () => {
    const loads = buildLoads("multi", multiAssetManifest, new Set());
    expect(loads).toEqual([
      {
        structureId: "s1",
        url: "/anatomy/multi/a.glb",
        node: "n1",
        region: undefined,
        label: "One",
      },
      {
        structureId: "s2",
        url: "/anatomy/multi/b.glb",
        node: "n2",
        region: undefined,
        label: "Two",
      },
    ]);
  });

  it("returns null when a multi-asset structure omits asset", () => {
    const bad = {
      ...multiAssetManifest,
      structures: [{ id: "s1", label: "One", node: "n1" }],
    } satisfies AnatomySceneManifest;
    expect(buildLoads("multi", bad, new Set())).toBeNull();
  });
});
