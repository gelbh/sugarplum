import { describe, expect, it } from "vitest";
import { Box3, PerspectiveCamera, Vector3 } from "three";
import {
  applyPerspectiveFit,
  orbitDistanceLimits,
  perspectiveFitDistance,
} from "../../src/anatomy/cameraFit";

describe("perspectiveFitDistance", () => {
  it("scales linearly with radius", () => {
    const a = perspectiveFitDistance(10, 45, 1, 1.25);
    const b = perspectiveFitDistance(100, 45, 1, 1.25);
    expect(b / a).toBeCloseTo(10, 5);
  });

  it("uses padding 1.25 by default vs explicit 1", () => {
    const base = perspectiveFitDistance(10, 45, 1, 1);
    const padded = perspectiveFitDistance(10, 45, 1);
    expect(padded / base).toBeCloseTo(1.25, 5);
  });
});

describe("orbitDistanceLimits", () => {
  it("allows fit beyond absolute 80 for large scenes", () => {
    const { minDistance, maxDistance } = orbitDistanceLimits(2000);
    expect(maxDistance).toBeGreaterThan(2000);
    expect(maxDistance).toBeGreaterThan(80);
    expect(minDistance).toBeLessThan(2000);
    expect(minDistance).toBeGreaterThan(0);
  });

  it("keeps a usable band for small meter-scale fits", () => {
    const { minDistance, maxDistance } = orbitDistanceLimits(4.5);
    expect(minDistance).toBeLessThan(4.5);
    expect(maxDistance).toBeGreaterThan(4.5);
  });
});

describe("applyPerspectiveFit", () => {
  it("places camera farther than 80 for a canine-scale box", () => {
    const box = new Box3(
      new Vector3(-500, -200, -500),
      new Vector3(500, 200, 500),
    );
    const camera = new PerspectiveCamera(45, 16 / 9, 0.01, 100);
    const controls = {
      target: new Vector3(),
      minDistance: 0.35,
      maxDistance: 80,
      update() {},
    };
    const { fitDistance } = applyPerspectiveFit(
      camera,
      controls,
      box,
      16 / 9,
    );
    expect(fitDistance).toBeGreaterThan(80);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(
      fitDistance,
      4,
    );
    expect(controls.maxDistance).toBeGreaterThan(fitDistance);
    expect(controls.minDistance).toBeLessThan(fitDistance);
    expect(camera.far).toBeGreaterThan(controls.maxDistance!);
  });

  it("keeps unit-cube corners inside the viewport after oblique fit", () => {
    const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const camera = new PerspectiveCamera(45, 1, 0.01, 100);
    const controls = {
      target: new Vector3(),
      minDistance: 0.35,
      maxDistance: 80,
      update() {},
    };
    applyPerspectiveFit(camera, controls, box, 1);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld(true);
    const corners = [
      [-1, -1, -1],
      [-1, -1, 1],
      [-1, 1, -1],
      [-1, 1, 1],
      [1, -1, -1],
      [1, -1, 1],
      [1, 1, -1],
      [1, 1, 1],
    ] as const;
    const v = new Vector3();
    for (const [x, y, z] of corners) {
      v.set(x, y, z).project(camera);
      expect(Math.abs(v.x)).toBeLessThanOrEqual(1.01);
      expect(Math.abs(v.y)).toBeLessThanOrEqual(1.01);
    }
  });
});
