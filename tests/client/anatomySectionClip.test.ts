import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from "three";
import {
  attachSectionClipPlanes,
  parkedSectionClipConstant,
  sectionClipConstant,
} from "../../src/anatomy/anatomySectionClip";

describe("sectionClipConstant", () => {
  it("maps t=0 to minX face", () => {
    expect(sectionClipConstant(-2, 4, 0)).toBe(2);
  });

  it("maps t=0.5 to midpoint", () => {
    expect(sectionClipConstant(-2, 4, 0.5)).toBe(-1);
  });

  it("maps t=1 to maxX face", () => {
    expect(sectionClipConstant(-2, 4, 1)).toBe(-4);
  });

  it("clamps t outside [0,1]", () => {
    expect(sectionClipConstant(-2, 4, -1)).toBe(2);
    expect(sectionClipConstant(-2, 4, 2)).toBe(-4);
  });

  it("handles zero span", () => {
    expect(sectionClipConstant(3, 3, 0.5)).toBe(-3);
  });
});

describe("parkedSectionClipConstant", () => {
  it("parks strictly outside the AABB along +X", () => {
    const minX = -2;
    const maxX = 4;
    const parked = parkedSectionClipConstant(minX, maxX);
    // For unit +X, point (maxX,0,0) has nx·x + c = maxX + c; park so maxX + c < 0
    expect(maxX + parked).toBeLessThan(0);
    // And farther than depth at t=1
    expect(parked).not.toBe(sectionClipConstant(minX, maxX, 1));
  });
});

describe("attachSectionClipPlanes", () => {
  it("assigns the same planes array to mesh materials", () => {
    const root = new Object3D();
    const mat = new MeshBasicMaterial();
    root.add(new Mesh(new BoxGeometry(1, 1, 1), mat));
    const planes: unknown[] = [{ n: 1 }];
    const versionBefore = mat.version;
    const attached = attachSectionClipPlanes(root, planes);
    expect(attached).toBe(1);
    expect(mat.clippingPlanes).toBe(planes);
    // three.js Material.needsUpdate setter bumps version (getter is not a sticky bool)
    expect(mat.version).toBeGreaterThan(versionBefore);
  });

  it("is idempotent when the same array ref is already set", () => {
    const root = new Object3D();
    const mat = new MeshBasicMaterial();
    root.add(new Mesh(new BoxGeometry(1, 1, 1), mat));
    const planes: unknown[] = [{ n: 1 }];
    expect(attachSectionClipPlanes(root, planes)).toBe(1);
    expect(attachSectionClipPlanes(root, planes)).toBe(0);
    expect(mat.clippingPlanes).toBe(planes);
  });
});
