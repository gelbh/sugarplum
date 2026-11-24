import useMediaQuery from "@mui/material/useMediaQuery";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  DRAG_SLOP_PX,
  REVIEW_FLY_MS,
  gesturePassedSlop,
  resolveReviewSwipe,
  reviewSwipeVisual,
  type ReviewSwipeDecision,
} from "./cardGestures";
import { gradeColorVars } from "../grading/gradeColors";
import { reviewArrowDecision } from "../session/studyKeys";

export function applyReviewSwipeFrame(
  plate: HTMLElement,
  stamp: HTMLElement | null,
  visual: ReturnType<typeof reviewSwipeVisual>,
): void {
  plate.style.transform = visual.transform;
  plate.style.opacity = visual.dimmed ? "0.4" : "1";
  if (!stamp) return;
  const tone = gradeColorVars(visual.stamp === "accept" ? 4 : 1);
  stamp.style.opacity = String(visual.stampOpacity);
  stamp.textContent = visual.stamp === "accept" ? "Accept" : "Reject";
  stamp.hidden = visual.stamp === null;
  stamp.style.color = tone.border;
  stamp.style.borderColor = tone.border;
  stamp.style.transform = `translateX(-50%) rotate(${visual.stamp === "accept" ? -10 : 10}deg)`;
}

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
  const [leaving, setLeaving] = useState<ReviewSwipeDecision | null>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLDivElement>(null);
  const releaseDxRef = useRef(0);
  const pointerRef = useRef<TrackedPointer | null>(null);
  const suppressClickRef = useRef(false);
  const committingRef = useRef(false);
  const mountedRef = useRef(false);
  const reduceMotionRef = useRef(reduceMotion);
  const blocked = locked || leaving !== null;

  const paint = (dx: number, leavingNow: ReviewSwipeDecision | null) => {
    const plate = plateRef.current;
    if (!plate) return;
    const visual = reviewSwipeVisual({
      dx,
      leaving: leavingNow,
      reduceMotion: reduceMotionRef.current,
    });
    applyReviewSwipeFrame(plate, stampRef.current, visual);
  };

  const springBack = () => {
    releaseDxRef.current = 0;
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
  };

  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  useEffect(() => {
    mountedRef.current = true;
    const stamp = stampRef.current;
    if (stamp) {
      stamp.hidden = true;
      stamp.style.opacity = "0";
    }
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
    paint(reduceMotion ? releaseDxRef.current : 0, leaving);
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
        Math.abs(moveDy) >= DRAG_SLOP_PX &&
        Math.abs(moveDy) >= Math.abs(moveDx)
      ) {
        pointerRef.current = null;
        return;
      }
      if (!gesturePassedSlop({ dx: moveDx, dy: 0 })) return;
      tracked.dragging = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    releaseDxRef.current = moveDx;
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
    leaving,
    commit,
  };
}
