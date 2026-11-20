export const PICK_DRAG_THRESHOLD_PX = 4;
/** Touch/pen OS slop is often ~8–10 CSS px; keep mouse tighter. */
export const PICK_DRAG_THRESHOLD_TOUCH_PX = 10;

export function pickThresholdForPointerType(pointerType: string): number {
  return pointerType === "mouse"
    ? PICK_DRAG_THRESHOLD_PX
    : PICK_DRAG_THRESHOLD_TOUCH_PX;
}

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
