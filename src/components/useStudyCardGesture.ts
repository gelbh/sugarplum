import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { StudyRating } from "../api/client";
import { armGesture, resolveCardGesture } from "../study/cardGestures";

type PointerStart = {
  id: number;
  x: number;
  y: number;
  scrollEl: HTMLElement | null;
  scrollTop: number;
  armed: boolean;
};

function scrollableCardFace(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const face = target.closest("[data-card-face-content]");
  if (!(face instanceof HTMLElement)) return null;
  if (face.scrollHeight <= face.clientHeight) return null;
  return face;
}

export function useStudyCardGesture({
  canCommit,
  revealed,
  onReveal,
  onGrade,
}: {
  canCommit: () => boolean;
  revealed: boolean;
  onReveal: () => void;
  onGrade: (rating: StudyRating) => void;
}) {
  const pointerRef = useRef<PointerStart | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    const scrollEl = scrollableCardFace(e.target);
    pointerRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      scrollEl,
      scrollTop: scrollEl?.scrollTop ?? 0,
      armed: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const armed = armGesture(start.armed, dx, dy);
    if (armed && !start.armed) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    pointerRef.current = { ...start, armed };
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start || start.id !== e.pointerId || !canCommit()) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!armGesture(start.armed, dx, dy)) return;
    if (
      Math.abs(dy) >= Math.abs(dx) &&
      start.scrollEl &&
      start.scrollEl.scrollTop !== start.scrollTop
    ) {
      return;
    }
    const result = resolveCardGesture({ revealed, dx, dy });
    if (result.type === "reveal") {
      onReveal();
      return;
    }
    if (result.type === "grade") {
      void onGrade(result.rating);
    }
  };

  const onPointerCancel = () => {
    pointerRef.current = null;
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
