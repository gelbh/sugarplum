import { Mesh, type Material, type MeshStandardMaterial, type Object3D } from "three";
import {
  didacticColorFor,
  type DidacticTintKey,
} from "./didacticPalette";

/** Overlay packs that must stay readable on top of textured skeleton bones. */
const FORCE_TINT_REGIONS = new Set(["brachial-plexus"]);

/** Near-equal RGB channels; skip real albedo maps, allow tiny gray placeholders. */
function isFlatGrayMaterial(mat: Material): boolean {
  const m = mat as MeshStandardMaterial;
  if (!m.color) return false;
  const { r, g, b } = m.color;
  const gray = Math.abs(r - g) < 0.06 && Math.abs(g - b) < 0.06;
  if (!gray) return false;
  if (!m.map) return true;
  const img = m.map.image as { width?: number; height?: number } | undefined;
  const w = img?.width ?? 0;
  const h = img?.height ?? 0;
  // IVALA mesh-only extract used a 2×2 gray stub; treat as untinted gray.
  return w > 0 && h > 0 && w <= 4 && h <= 4;
}

/**
 * IVALA / trimesh GLBs often omit metallicFactor (glTF default 1), which makes
 * tissue albedos render near-black. Force dielectric shading for anatomy meshes.
 */
export function prepareAnatomyMaterials(root: Object3D) {
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (!mat) continue;
      const m = mat as MeshStandardMaterial;
      if ("metalness" in m) m.metalness = 0;
      if ("roughness" in m && typeof m.roughness === "number") {
        m.roughness = Math.max(m.roughness, 0.35);
      }
      m.needsUpdate = true;
    }
  });
}

/**
 * Clone shared glTF materials and tint flat gray meshes with the didactic palette.
 * Textured / already-colored materials are left alone, except FORCE_TINT_REGIONS
 * (Kabsch overlays that otherwise z-fight into the skeleton albedo).
 * Surface region: translucent shell so skeleton/organs stay readable underneath.
 *
 * Replaced originals are stashed on `userData.didacticOrphans` so dispose can
 * free them (clones alone would leak the detached materials/textures).
 */
export function applyDidacticTint(root: Object3D, key: DidacticTintKey) {
  prepareAnatomyMaterials(root);
  const hex = didacticColorFor(key);
  const surfaceShell = key.region === "surface";
  const forceTint = Boolean(
    hex && key.region && FORCE_TINT_REGIONS.has(key.region),
  );
  if (!hex && !surfaceShell) return;
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const orphans = (obj.userData.didacticOrphans ??= []) as Material[];
    const next = list.map((mat) => {
      if (!mat) return mat;
      const tintGray = Boolean(hex) && isFlatGrayMaterial(mat);
      if (!tintGray && !surfaceShell && !forceTint) return mat;
      const cloned = mat.clone() as MeshStandardMaterial;
      orphans.push(mat);
      if ((tintGray || forceTint) && hex) {
        cloned.color.set(hex);
        if (forceTint) {
          // Drop albedo map so the teaching color wins over bone diffuse.
          cloned.map = null;
          if ("emissive" in cloned) cloned.emissive.set(hex);
          if ("emissiveIntensity" in cloned) cloned.emissiveIntensity = 0.15;
        }
      }
      cloned.metalness = 0;
      if ("roughness" in cloned && typeof cloned.roughness === "number") {
        cloned.roughness = Math.max(cloned.roughness, 0.45);
      }
      if (surfaceShell) {
        cloned.transparent = true;
        cloned.opacity = 0.28;
        cloned.depthWrite = false;
      }
      cloned.needsUpdate = true;
      return cloned;
    });
    obj.material = next.length === 1 ? next[0] : next;
  });
}
