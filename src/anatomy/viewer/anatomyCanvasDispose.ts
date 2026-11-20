import type { Material, Object3D, Texture } from "three";
import { disposeGeometryWithBvh } from "./anatomyBvh";

export function disposeMaterial(mat: Material) {
  for (const value of Object.values(mat)) {
    const tex = value as Texture | undefined;
    if (
      tex &&
      typeof tex === "object" &&
      "isTexture" in tex &&
      tex.isTexture
    ) {
      tex.dispose();
    }
  }
  mat.dispose();
}

export function disposeObjectTree(root: Object3D) {
  root.traverse((obj) => {
    const orphans = obj.userData?.didacticOrphans as Material[] | undefined;
    if (orphans?.length) {
      for (const mat of orphans) disposeMaterial(mat);
      obj.userData.didacticOrphans = [];
    }
    const mesh = obj as Object3D & {
      geometry?: {
        dispose: () => void;
        disposeBoundsTree?: () => void;
        boundsTree?: unknown;
      };
      material?: Material | Material[];
    };
    if (mesh.geometry) disposeGeometryWithBvh(mesh.geometry);
    const mats = mesh.material
      ? Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      : [];
    for (const mat of mats) disposeMaterial(mat);
  });
}
