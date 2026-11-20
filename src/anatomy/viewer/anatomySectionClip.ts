import { Mesh, type Material, type Object3D } from "three";

export const SECTION_CLIP_NORMAL = { x: 1, y: 0, z: 0 } as const;

function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

/** Plane constant for unit +X normal: nx·x + c = 0 with point at lerp(minX,maxX,t). */
export function sectionClipConstant(
  minX: number,
  maxX: number,
  t01: number,
): number {
  const t = clamp01(t01);
  if (maxX === minX) return -minX;
  return -(minX + t * (maxX - minX));
}

/** Park past the +X side of the AABB so the whole volume is unclipped when enabled is false. */
export function parkedSectionClipConstant(
  minX: number,
  maxX: number,
): number {
  const span = Math.max(maxX - minX, 0);
  return -(maxX + span + 1);
}

export function attachSectionClipPlanes(
  root: Object3D,
  planes: readonly unknown[],
): number {
  let attached = 0;
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (!mat) continue;
      const m = mat as Material;
      if (m.clippingPlanes === planes) continue;
      m.clippingPlanes = planes as Material["clippingPlanes"];
      m.needsUpdate = true;
      attached += 1;
    }
  });
  return attached;
}
