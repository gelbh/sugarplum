export const PICK_DRAG_THRESHOLD_PX = 4;

export function movementExceeded(
  dx: number,
  dy: number,
  thresholdPx: number = PICK_DRAG_THRESHOLD_PX,
): boolean {
  return Math.hypot(dx, dy) > thresholdPx;
}
