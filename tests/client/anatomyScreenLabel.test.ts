import { describe, expect, it } from "vitest";
import {
  Box3,
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
} from "three";
import {
  MASKED_STRUCTURE_LABEL,
  anchorWorldPointFromObject,
  isNdcDepthInView,
  ndcToCanvasCss,
  selectedStructureLabelText,
  shouldShowSelectedLabel,
} from "../../src/anatomy/viewer/anatomyScreenLabel";

describe("selectedStructureLabelText", () => {
  it("returns the real label when not masking", () => {
    expect(
      selectedStructureLabelText({
        label: "Femur",
        maskNames: false,
        revealed: false,
      }),
    ).toBe("Femur");
  });

  it("returns Hidden when masked and unrevealed", () => {
    expect(
      selectedStructureLabelText({
        label: "Femur",
        maskNames: true,
        revealed: false,
      }),
    ).toBe(MASKED_STRUCTURE_LABEL);
  });

  it("returns the real label when masked but revealed", () => {
    expect(
      selectedStructureLabelText({
        label: "Femur",
        maskNames: true,
        revealed: true,
      }),
    ).toBe("Femur");
  });
});

describe("shouldShowSelectedLabel", () => {
  it("hides when nothing selected or text missing", () => {
    expect(
      shouldShowSelectedLabel({
        selectedId: null,
        hasRoot: true,
        structureVisible: true,
        labelText: "Femur",
      }),
    ).toBe(false);
    expect(
      shouldShowSelectedLabel({
        selectedId: "a",
        hasRoot: true,
        structureVisible: true,
        labelText: null,
      }),
    ).toBe(false);
    expect(
      shouldShowSelectedLabel({
        selectedId: "a",
        hasRoot: true,
        structureVisible: true,
        labelText: "  ",
      }),
    ).toBe(false);
  });

  it("hides when root missing or not visible", () => {
    expect(
      shouldShowSelectedLabel({
        selectedId: "a",
        hasRoot: false,
        structureVisible: true,
        labelText: "Femur",
      }),
    ).toBe(false);
    expect(
      shouldShowSelectedLabel({
        selectedId: "a",
        hasRoot: true,
        structureVisible: false,
        labelText: "Femur",
      }),
    ).toBe(false);
  });

  it("shows when selected, rooted, visible, and labeled", () => {
    expect(
      shouldShowSelectedLabel({
        selectedId: "a",
        hasRoot: true,
        structureVisible: true,
        labelText: "Hidden",
      }),
    ).toBe(true);
  });
});

describe("ndcToCanvasCss / depth", () => {
  it("maps center NDC to canvas center", () => {
    expect(ndcToCanvasCss(0, 0, 200, 100)).toEqual({ x: 100, y: 50 });
  });

  it("treats only [-1,1] NDC depth as in view", () => {
    expect(isNdcDepthInView(-1)).toBe(true);
    expect(isNdcDepthInView(0)).toBe(true);
    expect(isNdcDepthInView(1)).toBe(true);
    expect(isNdcDepthInView(-1.01)).toBe(false);
    expect(isNdcDepthInView(1.01)).toBe(false);
  });
});

describe("anchorWorldPointFromObject", () => {
  it("uses AABB center for a mesh with geometry", () => {
    const root = new Object3D();
    const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
    mesh.position.set(10, 0, 0);
    root.add(mesh);
    root.updateMatrixWorld(true);
    const out = anchorWorldPointFromObject(root, new Vector3(), new Box3());
    expect(out.x).toBeCloseTo(10, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });
});
