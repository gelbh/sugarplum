import type { PointerEvent as ReactPointerEvent } from "react";
import type { PageBox } from "../../materials/clientKernel";

export type SuggestedBox = PageBox & { key: string };

export type DragRect = { x0: number; y0: number; x1: number; y1: number };

export function normalizeDrag(d: DragRect): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const x = Math.min(d.x0, d.x1);
  const y = Math.min(d.y0, d.y1);
  return { x, y, w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) };
}

export function pointerToCss(
  ev: ReactPointerEvent,
  el: HTMLElement,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return {
    x: ev.clientX - rect.left,
    y: ev.clientY - rect.top,
  };
}
