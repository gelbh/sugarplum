export const PICK_DRAG_THRESHOLD_PX = 4;

export function movementExceeded(
  dx: number,
  dy: number,
  thresholdPx: number = PICK_DRAG_THRESHOLD_PX,
): boolean {
  return Math.hypot(dx, dy) > thresholdPx;
}

/** True when pointerup should select (not a drag or multi-touch gesture). */
export function shouldCommitPick(opts: {
  exceededDuring: boolean;
  multiPointer: boolean;
  endDx: number;
  endDy: number;
  thresholdPx?: number;
}): boolean {
  if (opts.exceededDuring || opts.multiPointer) return false;
  return !movementExceeded(opts.endDx, opts.endDy, opts.thresholdPx);
}
