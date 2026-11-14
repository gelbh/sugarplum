import { BufferGeometry, Mesh, type Object3D } from "three";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";

let installed = false;

export function installAnatomyAcceleratedRaycast(): void {
  if (installed) return;
  BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  Mesh.prototype.raycast = acceleratedRaycast;
  installed = true;
}

export function buildBvhUnderRoot(root: Object3D): {
  built: number;
  failed: number;
} {
  let built = 0;
  let failed = 0;
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const geometry = obj.geometry;
    if (!(geometry instanceof BufferGeometry)) return;
    if (geometry.boundsTree) return;
    try {
      geometry.computeBoundsTree();
      if (geometry.boundsTree) built += 1;
    } catch {
      failed += 1;
    }
  });
  return { built, failed };
}

export function disposeGeometryWithBvh(geometry: {
  dispose: () => void;
  disposeBoundsTree?: () => void;
  boundsTree?: unknown;
}): void {
  if (typeof geometry.disposeBoundsTree === "function") {
    geometry.disposeBoundsTree();
  } else if ("boundsTree" in geometry) {
    geometry.boundsTree = undefined;
  }
  geometry.dispose();
}
