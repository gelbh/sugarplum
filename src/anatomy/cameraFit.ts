import {
  Box3,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
  type Camera,
} from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const DEFAULT_PADDING = 1.25;
const LOOK = new Vector3(0.7, 0.45, 0.9).normalize();

export type OrbitLimitControls = Pick<OrbitControls, "target" | "update"> & {
  minDistance?: number;
  maxDistance?: number;
};

/** Distance so an AABB of `halfExtent` (max half-axis) fills the tighter FOV. */
export function perspectiveFitDistance(
  halfExtent: number,
  fovDeg: number,
  aspect: number,
  padding = DEFAULT_PADDING,
): number {
  const half = Math.max(halfExtent, 1e-6);
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 1e-6));
  const limiting = Math.min(vFov, hFov);
  return (half / Math.tan(limiting / 2)) * padding;
}

export function orbitDistanceLimits(fitDistance: number): {
  minDistance: number;
  maxDistance: number;
} {
  const d = Math.max(fitDistance, 1e-6);
  return {
    minDistance: Math.max(d * 0.05, 1e-4),
    maxDistance: d * 20,
  };
}

function applyOrbitLimits(
  controls: OrbitLimitControls,
  fitDistance: number,
) {
  const limits = orbitDistanceLimits(fitDistance);
  if ("minDistance" in controls) controls.minDistance = limits.minDistance;
  if ("maxDistance" in controls) controls.maxDistance = limits.maxDistance;
}

function setPerspectiveNearFar(
  camera: PerspectiveCamera,
  size: number,
  distance: number,
) {
  camera.near = Math.min(Math.max(size / 100, 1e-4), distance / 100);
  camera.far = Math.max(size * 10, distance * 10);
  camera.updateProjectionMatrix();
}

function boxHalfExtent(box: Box3): { center: Vector3; half: number; sizeLen: number } {
  const sizeVec = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const half = Math.max(sizeVec.x, sizeVec.y, sizeVec.z) / 2 || 1e-6;
  const sizeLen = sizeVec.length() || half * 2;
  return { center, half, sizeLen };
}

export function applyPerspectiveFit(
  camera: PerspectiveCamera,
  controls: OrbitLimitControls,
  box: Box3,
  aspect: number,
): { fitDistance: number } {
  const { center, half, sizeLen } = boxHalfExtent(box);
  const fitDistance = perspectiveFitDistance(half, camera.fov, aspect);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(LOOK, fitDistance);
  setPerspectiveNearFar(camera, sizeLen, fitDistance);
  applyOrbitLimits(controls, fitDistance);
  controls.update();
  return { fitDistance };
}

export function applyOrthographicFit(
  camera: OrthographicCamera,
  controls: OrbitLimitControls,
  box: Box3,
  aspect: number,
  halfPad = 0.55,
): { fitDistance: number } {
  const sizeVec = box.getSize(new Vector3());
  const size = sizeVec.length() || 1;
  const center = box.getCenter(new Vector3());
  const half = Math.max(sizeVec.x, sizeVec.y, sizeVec.z) * halfPad || 1;
  camera.left = -half * aspect;
  camera.right = half * aspect;
  camera.top = half;
  camera.bottom = -half;
  camera.near = size / 100;
  camera.far = size * 10;
  const fitDistance = size;
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(LOOK, fitDistance);
  camera.updateProjectionMatrix();
  applyOrbitLimits(controls, fitDistance);
  controls.update();
  return { fitDistance };
}

export function applyFit(
  camera: Camera,
  controls: OrbitLimitControls,
  box: Box3,
  aspect: number,
): { fitDistance: number } {
  if (camera instanceof OrthographicCamera) {
    return applyOrthographicFit(camera, controls, box, aspect, 0.55);
  }
  if (camera instanceof PerspectiveCamera) {
    return applyPerspectiveFit(camera, controls, box, aspect);
  }
  return { fitDistance: 1 };
}

export function applyFocus(
  camera: Camera,
  controls: OrbitLimitControls,
  box: Box3,
  aspect: number,
): { fitDistance: number } {
  if (camera instanceof OrthographicCamera) {
    return applyOrthographicFit(camera, controls, box, aspect, 0.7);
  }
  if (camera instanceof PerspectiveCamera) {
    const { center, half, sizeLen } = boxHalfExtent(box);
    const fitDistance = perspectiveFitDistance(half, camera.fov, aspect);
    controls.target.copy(center);
    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 1e-6) {
      offset.copy(LOOK).multiplyScalar(fitDistance);
    } else {
      offset.setLength(fitDistance);
    }
    camera.position.copy(center).add(offset);
    setPerspectiveNearFar(camera, sizeLen, fitDistance);
    applyOrbitLimits(controls, fitDistance);
    controls.update();
    return { fitDistance };
  }
  return { fitDistance: 1 };
}
