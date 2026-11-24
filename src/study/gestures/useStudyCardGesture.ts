import useMediaQuery from "@mui/material/useMediaQuery";
import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { StudyRating } from "../../api/client";
import {
  REVIEW_FLY_MS,
  armGesture,
  resolveCardGesture,
  studyPointerAllowed,
  studySwipeVisual,
} from "./cardGestures";
import { gradeColorVars } from "../grading/gradeColors";

const NO_SWIPE_SELECTOR =
  'input, textarea, button, select, [role="combobox"], [data-no-swipe]';

type PointerStart = {
  id: number;
  x: number;
  y: number;
  scrollEl: HTMLElement | null;
  scrollTop: number;
  armed: boolean;
};

export function applyStudySwipeFrame(
  plate: HTMLElement,
  stamp: HTMLElement | null,
  visual: ReturnType<typeof studySwipeVisual>,
): void {
  plate.style.transform = visual.transform;
  if (!stamp) return;

  const label = visual.stampLabel ?? "";
  const ratingKey =
    visual.stampRating == null ? "" : String(visual.stampRating);
  const chromeKey = `${label}|${ratingKey}`;
  stamp.style.opacity = String(visual.stampOpacity);
  stamp.hidden = visual.stampLabel === null;
  stamp.style.visibility = visual.stampLabel === null ? "hidden" : "visible";

  if (stamp.dataset.stampChrome !== chromeKey) {
    stamp.dataset.stampChrome = chromeKey;
    stamp.textContent = label;
    if (visual.stampRating != null) {
      const tone = gradeColorVars(visual.stampRating);
      stamp.style.color = tone.border;
      stamp.style.borderColor = tone.border;
    } else {
      stamp.style.color = "var(--sp-ivory)";
      stamp.style.borderColor =
        "color-mix(in srgb, var(--sp-ivory) 55%, transparent)";
    }
  }
}

function scrollableCardFace(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const face = target.closest("[data-card-face-content]");
  if (!(face instanceof HTMLElement)) return null;
  if (face.scrollHeight <= face.clientHeight) return null;
  return face;
}

export function useStudyCardGesture({
  canCommit,
  blocked,
  revealed,
  onGrade,
}: {
  canCommit: () => boolean;
  blocked: () => boolean;
  revealed: boolean;
  onGrade: (rating: StudyRating) => void;
}) {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const reduceMotionRef = useRef(reduceMotion);
  const revealedRef = useRef(revealed);
  const pointerRef = useRef<PointerStart | null>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLDivElement>(null);
  const latestDeltaRef = useRef({ dx: 0, dy: 0 });
  const rafRef = useRef<number | null>(null);

  // Sync during render so flipBack / queue flush cannot leave a stale true
  // for a frame of post-reveal-only paint gates.
  revealedRef.current = revealed;

  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  const cancelPaintRaf = () => {
    if (rafRef.current == null) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const resetStamp = () => {
    const stamp = stampRef.current;
    if (!stamp) return;
    stamp.hidden = true;
    stamp.style.opacity = "0";
    stamp.style.visibility = "hidden";
    stamp.textContent = "";
    delete stamp.dataset.stampChrome;
  };

  // Attach after StudyPage leaves Loading so idle hide cannot race ready.
  const stampCallbackRef = useCallback((node: HTMLDivElement | null) => {
    stampRef.current = node;
    if (!node) return;
    node.hidden = true;
    node.style.opacity = "0";
    node.style.visibility = "hidden";
    node.textContent = "";
    delete node.dataset.stampChrome;
  }, []);

  useEffect(() => () => cancelPaintRaf(), []);

  const paint = (dx: number, dy: number) => {
    const plate = plateRef.current;
    if (!plate) return;
    applyStudySwipeFrame(
      plate,
      stampRef.current,
      studySwipeVisual({
        dx,
        dy,
        revealed: revealedRef.current,
        reduceMotion: reduceMotionRef.current,
      }),
    );
  };

  const schedulePaint = (dx: number, dy: number) => {
    latestDeltaRef.current = { dx, dy };
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const { dx: latestDx, dy: latestDy } = latestDeltaRef.current;
      paint(latestDx, latestDy);
    });
  };

  const clearPaint = () => {
    cancelPaintRaf();
    const plate = plateRef.current;
    if (plate) {
      plate.style.transition = "";
      plate.style.transform = "";
      plate.style.willChange = "";
    }
    resetStamp();
  };

  const springBack = () => {
    cancelPaintRaf();
    const plate = plateRef.current;
    if (plate) {
      plate.style.transition = reduceMotionRef.current
        ? "none"
        : `transform ${REVIEW_FLY_MS}ms ease-out`;
      plate.style.transform = "";
      plate.style.willChange = "";
    }
    resetStamp();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest(NO_SWIPE_SELECTOR)) return;
    if (
      !studyPointerAllowed({
        blocked: blocked(),
        targetInHost: e.currentTarget.contains(target),
      })
    ) {
      return;
    }
    // 1A: no drag until answer is showing.
    if (!revealedRef.current) return;
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
    if (!revealedRef.current || blocked()) {
      pointerRef.current = null;
      springBack();
      return;
    }
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // Scrollable face + vertical-dominant: leave scroll alone (no paint/capture).
    if (start.scrollEl && Math.abs(dy) >= Math.abs(dx)) {
      return;
    }
    const armed = armGesture(start.armed, dx, dy);
    if (armed && !start.armed) {
      // Synthetic/devtools pointers can throw; paint must still run.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* no active pointer id */
      }
      if (plateRef.current) plateRef.current.style.willChange = "transform";
    }
    pointerRef.current = { ...start, armed };
    if (!armed) return;
    if (plateRef.current) plateRef.current.style.transition = "none";
    schedulePaint(dx, dy);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start || start.id !== e.pointerId) return;
    if (!revealedRef.current || blocked() || !canCommit()) {
      springBack();
      return;
    }
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!armGesture(start.armed, dx, dy)) {
      springBack();
      return;
    }
    if (
      Math.abs(dy) >= Math.abs(dx) &&
      start.scrollEl &&
      start.scrollEl.scrollTop !== start.scrollTop
    ) {
      springBack();
      return;
    }
    const result = resolveCardGesture({
      revealed: revealedRef.current,
      dx,
      dy,
    });
    if (result.type === "none") {
      springBack();
      return;
    }
    clearPaint();
    void onGrade(result.rating);
  };

  const onPointerCancel = () => {
    pointerRef.current = null;
    springBack();
  };

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    plateRef,
    stampRef: stampCallbackRef,
  };
}
