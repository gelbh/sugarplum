import { describe, expect, it } from "vitest";
import {
  Bone,
  BoxGeometry,
  BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Skeleton,
  SkinnedMesh,
} from "three";
import {
  buildBvhUnderRoot,
  disposeGeometryWithBvh,
  installAnatomyAcceleratedRaycast,
} from "../../src/anatomy/anatomyBvh";

describe("anatomyBvh", () => {
  it("install is idempotent", () => {
    installAnatomyAcceleratedRaycast();
    installAnatomyAcceleratedRaycast();
    expect(typeof BoxGeometry.prototype.computeBoundsTree).toBe("function");
    expect(typeof BoxGeometry.prototype.disposeBoundsTree).toBe("function");
  });

  it("buildBvhUnderRoot sets boundsTree on mesh geometry", () => {
    installAnatomyAcceleratedRaycast();
    const root = new Object3D();
    const geom = new BoxGeometry(1, 1, 1);
    root.add(new Mesh(geom, new MeshBasicMaterial()));
    const result = buildBvhUnderRoot(root);
    expect(result.built).toBe(1);
    expect(result.failed).toBe(0);
    expect(geom.boundsTree).toBeTruthy();
  });

  it("buildBvhUnderRoot skips meshes that already have a tree", () => {
    installAnatomyAcceleratedRaycast();
    const root = new Object3D();
    const geom = new BoxGeometry(1, 1, 1);
    root.add(new Mesh(geom, new MeshBasicMaterial()));
    expect(buildBvhUnderRoot(root).built).toBe(1);
    expect(buildBvhUnderRoot(root).built).toBe(0);
  });

  it("buildBvhUnderRoot silently counts failure without throwing", () => {
    installAnatomyAcceleratedRaycast();
    const root = new Object3D();
    const geom = new BoxGeometry(1, 1, 1);
    root.add(new Mesh(geom, new MeshBasicMaterial()));
    geom.computeBoundsTree = () => {
      throw new Error("forced bvh failure");
    };
    const result = buildBvhUnderRoot(root);
    expect(result.failed).toBe(1);
    expect(result.built).toBe(0);
    expect(geom.boundsTree).toBeFalsy();
  });

  it("disposeGeometryWithBvh clears boundsTree then disposes", () => {
    installAnatomyAcceleratedRaycast();
    const geom = new BoxGeometry(1, 1, 1);
    geom.computeBoundsTree();
    expect(geom.boundsTree).toBeTruthy();
    disposeGeometryWithBvh(geom);
    expect(geom.boundsTree).toBeFalsy();
  });

  it("skips SkinnedMesh and morph-target geometries", () => {
    installAnatomyAcceleratedRaycast();
    const root = new Object3D();

    const morphGeom = new BoxGeometry(1, 1, 1);
    morphGeom.morphAttributes.position = [
      new BufferAttribute(new Float32Array(morphGeom.attributes.position.array), 3),
    ];
    root.add(new Mesh(morphGeom, new MeshBasicMaterial()));

    const skinGeom = new BoxGeometry(1, 1, 1);
    const bone = new Bone();
    const skinned = new SkinnedMesh(skinGeom, new MeshBasicMaterial());
    skinned.add(bone);
    skinned.bind(new Skeleton([bone]));
    root.add(skinned);

    const result = buildBvhUnderRoot(root);
    expect(result.built).toBe(0);
    expect(result.failed).toBe(0);
    expect(morphGeom.boundsTree).toBeFalsy();
    expect(skinGeom.boundsTree).toBeFalsy();
  });
});
