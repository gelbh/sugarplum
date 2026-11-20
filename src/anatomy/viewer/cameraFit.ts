import {
  Box3,
  OrthographicCamera,
  PerspectiveCamera,
  Sphere,
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

/** Distance so a sphere of `radius` fills the tighter FOV (covers AABB corners). */
export function perspectiveFitDistance(
  radius: number,
  fovDeg: number,
  aspect: number,
  padding = DEFAULT_PADDING,
): number {
  const r = Math.max(radius, 1e-6);
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 1e-6));
  const limiting = Math.min(vFov, hFov);
  return (r / Math.tan(limiting / 2)) * padding;
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
  return limits;
}

function setPerspectiveNearFar(
  camera: PerspectiveCamera,
  size: number,
  distance: number,
  maxDistance: number,
) {
  camera.near = Math.min(Math.max(size / 100, 1e-4), distance / 100);
  camera.far = Math.max(size * 10, distance * 10, maxDistance * 1.25 + size);
  camera.updateProjectionMatrix();
}

function boxSphere(box: Box3): { center: Vector3; radius: number; sizeLen: number } {
  const sphere = box.getBoundingSphere(new Sphere());
  const sizeLen = box.getSize(new Vector3()).length() || sphere.radius * 2;
  return {
    center: sphere.center,
    radius: Math.max(sphere.radius, 1e-6),
    sizeLen,
  };
}

export function applyPerspectiveFit(
  camera: PerspectiveCamera,
  controls: OrbitLimitControls,
  box: Box3,
  aspect: number,
): { fitDistance: number } {
  const { center, radius, sizeLen } = boxSphere(box);
  const fitDistance = perspectiveFitDistance(radius, camera.fov, aspect);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(LOOK, fitDistance);
  const limits = applyOrbitLimits(controls, fitDistance);
  setPerspectiveNearFar(camera, sizeLen, fitDistance, limits.maxDistance);
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
  const { center, radius, sizeLen } = boxSphere(box);
  // Sphere radius covers oblique LOOK; pad matches prior AABB halfPad feel.
  const half = radius * (halfPad / 0.55);
  camera.zoom = 1;
  camera.left = -half * aspect;
  camera.right = half * aspect;
  camera.top = half;
  camera.bottom = -half;
  const fitDistance = Math.max(sizeLen, radius * 2);
  const limits = applyOrbitLimits(controls, fitDistance);
  camera.near = sizeLen / 100;
  camera.far = Math.max(sizeLen * 10, limits.maxDistance * 1.25 + sizeLen);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(LOOK, fitDistance);
  camera.updateProjectionMatrix();
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
    const { center, radius, sizeLen } = boxSphere(box);
    const fitDistance = perspectiveFitDistance(radius, camera.fov, aspect);
    controls.target.copy(center);
    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 1e-6) {
      offset.copy(LOOK).multiplyScalar(fitDistance);
    } else {
      offset.setLength(fitDistance);
    }
    camera.position.copy(center).add(offset);
    const limits = applyOrbitLimits(controls, fitDistance);
    setPerspectiveNearFar(camera, sizeLen, fitDistance, limits.maxDistance);
    controls.update();
    return { fitDistance };
  }
  return { fitDistance: 1 };
}
