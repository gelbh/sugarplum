import { Box3, Object3D, Vector3 } from "three";

export const MASKED_STRUCTURE_LABEL = "Hidden";

export function selectedStructureLabelText(input: {
  label: string;
  maskNames: boolean;
  revealed: boolean;
}): string {
  if (input.maskNames && !input.revealed) return MASKED_STRUCTURE_LABEL;
  return input.label;
}

export function shouldShowSelectedLabel(input: {
  selectedId: string | null;
  hasRoot: boolean;
  structureVisible: boolean;
  labelText: string | null | undefined;
}): boolean {
  if (!input.selectedId || !input.hasRoot || !input.structureVisible) {
    return false;
  }
  const text = input.labelText?.trim() ?? "";
  return text.length > 0;
}

export function ndcToCanvasCss(
  ndcX: number,
  ndcY: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (-ndcY * 0.5 + 0.5) * height,
  };
}

/** Three.js WebGL NDC depth is in [-1, 1] for both perspective and orthographic. */
export function isNdcDepthInView(ndcZ: number): boolean {
  return ndcZ >= -1 && ndcZ <= 1;
}

export function anchorWorldPointFromObject(
  obj: Object3D,
  out: Vector3,
  box: Box3 = new Box3(),
): Vector3 {
  box.setFromObject(obj);
  if (box.isEmpty()) {
    return obj.getWorldPosition(out);
  }
  return box.getCenter(out);
}
