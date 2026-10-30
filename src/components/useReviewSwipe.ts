import useMediaQuery from "@mui/material/useMediaQuery";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  REVIEW_DRAG_SLOP_PX,
  REVIEW_FLY_MS,
  resolveReviewSwipe,
  type ReviewSwipeDecision,
} from "../study/cardGestures";

const NO_SWIPE_SELECTOR =
  'input, textarea, button, select, [role="combobox"], [data-no-swipe]';

function isKeyboardTypingTarget(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return true;
  return (
    el.closest(
      '[role="dialog"], [role="listbox"], [role="menu"], [role="combobox"]',
    ) !== null
  );
}

type TrackedPointer = { id: number; x: number; y: number; dragging: boolean };

export function useReviewSwipe({
  locked,
  onCommit,
}: {
  locked: boolean;
  /** Resolve true once decided (the card unmounts); false springs it back. */
  onCommit: (decision: ReviewSwipeDecision) => Promise<boolean>;
}) {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [dx, setDx] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<ReviewSwipeDecision | null>(null);
  const pointerRef = useRef<TrackedPointer | null>(null);
  const suppressClickRef = useRef(false);
  const committingRef = useRef(false);
  const mountedRef = useRef(false);
  const blocked = locked || leaving !== null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function commit(decision: ReviewSwipeDecision) {
    if (blocked || committingRef.current) return;
    committingRef.current = true;
    pointerRef.current = null;
    setLeaving(decision);
    if (!reduceMotion) {
      await new Promise((resolve) => window.setTimeout(resolve, REVIEW_FLY_MS));
    }
    if (!mountedRef.current) return;
    let ok = false;
    try {
      ok = await onCommit(decision);
    } catch {
      ok = false;
    }
    if (ok || !mountedRef.current) return;
    committingRef.current = false;
    setLeaving(null);
    setDx(null);
  }

  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (
        e.repeat ||
        e.altKey ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.defaultPrevented
      ) {
        return;
      }
      if (isKeyboardTypingTarget(document.activeElement)) return;
      e.preventDefault();
      void commitRef.current(e.key === "ArrowRight" ? "accept" : "reject");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    suppressClickRef.current = false;
    if (blocked || !e.isPrimary || e.button !== 0) return;
    if (pointerRef.current?.dragging) return;
    const target = e.target as Element;
    // React bubbles portal events (occlusion dialog) through this tree.
    if (!e.currentTarget.contains(target)) return;
    if (target.closest(NO_SWIPE_SELECTOR)) return;
    const active = document.activeElement;
    if (isKeyboardTypingTarget(active) && e.currentTarget.contains(active)) {
      return;
    }
    pointerRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      dragging: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const tracked = pointerRef.current;
    if (!tracked || tracked.id !== e.pointerId) return;
    const moveDx = e.clientX - tracked.x;
    const moveDy = e.clientY - tracked.y;
    if (!tracked.dragging) {
      if (
        Math.abs(moveDy) >= REVIEW_DRAG_SLOP_PX &&
        Math.abs(moveDy) >= Math.abs(moveDx)
      ) {
        pointerRef.current = null;
        return;
      }
      if (Math.abs(moveDx) < REVIEW_DRAG_SLOP_PX) return;
      tracked.dragging = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDx(moveDx);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const tracked = pointerRef.current;
    if (!tracked || tracked.id !== e.pointerId) return;
    pointerRef.current = null;
    if (!tracked.dragging) return;
    suppressClickRef.current = true;
    requestAnimationFrame(() => {
      suppressClickRef.current = false;
    });
    const result = resolveReviewSwipe({
      dx: e.clientX - tracked.x,
      dy: e.clientY - tracked.y,
    });
    if (result === "none" || blocked) {
      setDx(null);
      return;
    }
    void commit(result);
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLElement>) => {
    if (pointerRef.current?.id !== e.pointerId) return;
    pointerRef.current = null;
    setDx(null);
  };

  const onClickCapture = (e: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClickCapture,
    },
    dx,
    leaving,
    reduceMotion,
    commit,
  };
}
