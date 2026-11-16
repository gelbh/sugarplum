import { describe, expect, it, vi } from "vitest";
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from "three";
import { installAnatomyAcceleratedRaycast } from "../../src/anatomy/anatomyBvh";
import {
  disposeMaterial,
  disposeObjectTree,
} from "../../src/anatomy/anatomyCanvasDispose";

describe("anatomyCanvasDispose", () => {
  it("disposeMaterial disposes the material", () => {
    const mat = new MeshBasicMaterial();
    const spy = vi.spyOn(mat, "dispose");
    disposeMaterial(mat);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("disposeObjectTree disposes mesh materials under the root", () => {
    installAnatomyAcceleratedRaycast();
    const root = new Object3D();
    const mat = new MeshBasicMaterial();
    const spy = vi.spyOn(mat, "dispose");
    root.add(new Mesh(new BoxGeometry(1, 1, 1), mat));
    disposeObjectTree(root);
    expect(spy).toHaveBeenCalledOnce();
  });
});
