import {
  Box3,
  Color,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { applyFit, applyFocus, orbitDistanceLimits } from "./cameraFit";

/** CSS hex (`#rrggbb`) or `null` for transparent (page shows through). */
export type AnatomyCanvasBackground = string | null;

export function setTreeWireframe(root: Object3D, wireframe: boolean) {
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (mat && "wireframe" in mat) {
        (mat as Material & { wireframe: boolean }).wireframe = wireframe;
        mat.needsUpdate = true;
      }
    }
  });
}

export function applySceneBackground(
  scene: Scene,
  renderer: WebGLRenderer,
  background: AnatomyCanvasBackground,
) {
  if (background == null) {
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    return;
  }
  const color = new Color(background);
  scene.background = color;
  renderer.setClearColor(color, 1);
}

export function fitCameraToUnion(
  camera: Camera,
  controls: OrbitControls,
  nodeMap: Map<string, Object3D>,
  aspect: number,
): number {
  if (nodeMap.size === 0) return 0;
  const box = new Box3();
  for (const obj of nodeMap.values()) box.expandByObject(obj);
  if (box.isEmpty()) return 0;
  return applyFit(camera, controls, box, aspect).fitDistance;
}

export function focusObject(
  camera: Camera,
  controls: OrbitControls,
  obj: Object3D,
  aspect: number,
  /** Keep zoom-out able to reach the last union framing. */
  unionFitDistance: number,
) {
  const box = new Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  applyFocus(camera, controls, box, aspect);
  if (unionFitDistance > 0) {
    const floor = orbitDistanceLimits(unionFitDistance);
    controls.maxDistance = Math.max(controls.maxDistance, floor.maxDistance);
    if (camera instanceof PerspectiveCamera) {
      camera.far = Math.max(camera.far, controls.maxDistance * 1.25);
      camera.updateProjectionMatrix();
    } else if (camera instanceof OrthographicCamera) {
      camera.far = Math.max(camera.far, controls.maxDistance * 1.25);
      camera.updateProjectionMatrix();
    }
  }
}
