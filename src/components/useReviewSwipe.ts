import useMediaQuery from "@mui/material/useMediaQuery";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  REVIEW_DRAG_SLOP_PX,
  REVIEW_FLY_MS,
  applyReviewSwipeFrame,
  resolveReviewSwipe,
  reviewSwipeVisual,
  type ReviewSwipeDecision,
} from "../study/cardGestures";
import { reviewArrowDecision } from "../study/studyKeys";

const NO_SWIPE_SELECTOR =
  'input, textarea, button, select, [role="combobox"], [data-no-swipe]';

const NON_TEXT_INPUT_TYPES = [
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
];

function isTextEntry(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true;
  return (
    el instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.includes(el.type)
  );
}

type TrackedPointer = { id: number; x: number; y: number; dragging: boolean };

export function useReviewSwipe({
  locked,
  stageRef,
  onCommit,
}: {
  locked: boolean;
  stageRef: RefObject<HTMLElement | null>;
  /** Resolve true once decided (the card unmounts); false springs it back. */
  onCommit: (decision: ReviewSwipeDecision) => Promise<boolean>;
}) {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<ReviewSwipeDecision | null>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<ReturnType<typeof reviewSwipeVisual> | null>(null);
  const draggingRef = useRef(false);
  const pointerRef = useRef<TrackedPointer | null>(null);
  const suppressClickRef = useRef(false);
  const committingRef = useRef(false);
  const mountedRef = useRef(false);
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  const blocked = locked || leaving !== null;

  const paint = (dx: number, leavingNow: ReviewSwipeDecision | null) => {
    const plate = plateRef.current;
    if (!plate) return;
    const visual = reviewSwipeVisual({
      dx,
      leaving: leavingNow,
      reduceMotion: reduceMotionRef.current,
    });
    frameRef.current = visual;
    applyReviewSwipeFrame(plate, stampRef.current, visual);
  };

  const springBack = () => {
    frameRef.current = null;
    draggingRef.current = false;
    const plate = plateRef.current;
    if (plate) {
      plate.style.transition = reduceMotionRef.current
        ? "none"
        : `transform ${REVIEW_FLY_MS}ms ease-out`;
      plate.style.transform = "";
      plate.style.opacity = "";
    }
    const stamp = stampRef.current;
    if (stamp) {
      stamp.hidden = true;
      stamp.style.opacity = "0";
    }
    setDragging(false);
  };

  useLayoutEffect(() => {
    const plate = plateRef.current;
    const visual = frameRef.current;
    if (!plate || !visual) return;
    if (!draggingRef.current && leaving === null) return;
    applyReviewSwipeFrame(plate, stampRef.current, visual);
  });

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
    draggingRef.current = false;
    setDragging(false);
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
    springBack();
  }

  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  useEffect(() => {
    if (!leaving) return;
    const plate = plateRef.current;
    if (plate) {
      plate.style.transition = reduceMotion
        ? "none"
        : `transform ${REVIEW_FLY_MS}ms ease-out`;
    }
    paint(0, leaving);
  }, [leaving, reduceMotion]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const active =
        document.activeElement instanceof Element ? document.activeElement : null;
      const decision = reviewArrowDecision(e, active, stageRef.current);
      if (!decision || e.defaultPrevented) return;
      e.preventDefault();
      void commitRef.current(decision);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stageRef]);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    suppressClickRef.current = false;
    if (blocked || !e.isPrimary || e.button !== 0) return;
    if (pointerRef.current?.dragging) return;
    const target = e.target as Element;
    // React bubbles portal events (occlusion dialog) through this tree.
    if (!e.currentTarget.contains(target)) return;
    if (target.closest(NO_SWIPE_SELECTOR)) return;
    const active = document.activeElement;
    if (isTextEntry(active) && e.currentTarget.contains(active)) {
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
    if (e.buttons === 0) {
      pointerRef.current = null;
      springBack();
      return;
    }
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
      draggingRef.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (plateRef.current) plateRef.current.style.transition = "none";
    paint(moveDx, null);
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
      springBack();
      return;
    }
    void commit(result);
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLElement>) => {
    if (pointerRef.current?.id !== e.pointerId) return;
    pointerRef.current = null;
    springBack();
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
    plateRef,
    stampRef,
    dragging,
    leaving,
    reduceMotion,
    commit,
  };
}
