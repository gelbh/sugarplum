/**
 * Mailbox grade feedback: a fixed ghost of the card flies into the chosen
 * grade box (WAAPI). Resolves when flight (or reduced-motion pulse) settles;
 * Study awaits before advancing so the next card does not pop mid-swallow.
 */

import type { StudyRating } from "../api/client";
import { gradeColorVars } from "./gradeColors";

const FLIGHT_MS = 480;
const BUMP_MS = 280;
const EASE = "cubic-bezier(0.45, 0, 0.55, 1)";
const ARRIVE_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export type FlyCardToGradeOpts = {
  rating: StudyRating;
};

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Visible study face to fly. React omits `aria-hidden={false}`, so we cannot
 * query `[aria-hidden="false"]`; take the innermost face that is not hidden.
 */
export function studyCardFlightSource(host: HTMLElement): HTMLElement | null {
  const cards = [
    ...host.querySelectorAll<HTMLElement>(".sp-playing-card"),
  ];
  if (cards.length === 0) return null;
  const visible = cards.filter(
    (el) => el.getAttribute("aria-hidden") !== "true",
  );
  const leaf = visible.find((el) => !el.querySelector(".sp-playing-card"));
  return leaf ?? visible[0] ?? cards[0] ?? null;
}

export function gradeMailboxEl(
  rating: StudyRating,
  root: ParentNode = document,
): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-grade-mailbox="${rating}"]`);
}

function quadraticPoint(
  t: number,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * x0 + 2 * u * t * cx + t * t * x1,
    y: u * u * y0 + 2 * u * t * cy + t * t * y1,
  };
}

/**
 * Solid card shell so the flight stays visible even when the 3D flip clone
 * would paint blank (backface / rotateY outside its parent).
 */
function buildGhost(
  from: HTMLElement,
  rect: DOMRect,
  rating: StudyRating,
): HTMLElement {
  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  ghost.dataset.gradeFlightGhost = "1";
  ghost.dataset.gradeRating = String(rating);

  const radius = getComputedStyle(from).borderRadius || "8px";
  const rim = `0 0 0 2px color-mix(in srgb, ${gradeColorVars(rating).border} 55%, transparent), 0 12px 40px rgba(0, 0, 0, 0.45)`;

  Object.assign(ghost.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    borderRadius: radius,
    background: "var(--sp-card-face, #f3ebe3)",
    color: "var(--sp-stage-bg, #1e0d1b)",
    boxShadow: rim,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "1400",
    transformOrigin: "center center",
    boxSizing: "border-box",
  });

  const clone = from.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  clone.querySelectorAll("button, a, input, textarea, select").forEach((n) => {
    n.setAttribute("tabindex", "-1");
    n.setAttribute("disabled", "true");
  });
  Object.assign(clone.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    margin: "0",
    transform: "none",
    transformStyle: "flat",
    backfaceVisibility: "visible",
    WebkitBackfaceVisibility: "visible",
    boxShadow: "none",
    transition: "none",
  });
  clone.querySelectorAll<HTMLElement>("*").forEach((node) => {
    node.style.transform = "none";
    node.style.backfaceVisibility = "visible";
    node.style.webkitBackfaceVisibility = "visible";
  });
  ghost.appendChild(clone);

  return ghost;
}

/**
 * Flies a ghost of `from` into `to` along a short arc, shrinking into the
 * mailbox. Resolves when the flight ends (immediately under reduced motion).
 */
export function flyCardToGrade(
  from: HTMLElement,
  to: HTMLElement,
  opts: FlyCardToGradeOpts,
): Promise<void> {
  const { rating } = opts;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (a.width < 2 || a.height < 2 || b.width < 2 || b.height < 2) {
    return Promise.resolve();
  }

  if (prefersReducedMotion()) {
    bumpGradeMailbox(to, { rating, intensity: "strong" });
    return Promise.resolve();
  }

  const ghost = buildGhost(from, a, rating);
  document.body.appendChild(ghost);
  // Hide the live face so only the ghost reads as the departing card.
  from.style.visibility = "hidden";
  bumpGradeMailbox(to, { rating, intensity: "strong" });

  const endX = b.left + b.width / 2 - (a.left + a.width / 2);
  const endY = b.top + b.height / 2 - (a.top + a.height / 2);
  const cx = endX * 0.45;
  const cy = Math.min(0, endY) - Math.min(72, Math.abs(endY) * 0.35 + 24);
  const endScale = Math.min(b.width / a.width, b.height / a.height) * 0.55;
  const yaw = endX === 0 ? 0 : endX > 0 ? 6 : -6;

  const steps = 20;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const { x, y } = quadraticPoint(t, 0, 0, cx, cy, endX, endY);
    const scale = 1 - (1 - endScale) * t;
    const opacity = t < 0.82 ? 1 : 1 - (t - 0.82) / 0.18;
    const rot = yaw * (1 - t);
    frames.push({
      transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`,
      opacity,
    });
  }

  const revealSource = () => {
    // Flip faces are reused across cards; clear the inline hide so MUI sx
    // visibility on the next reveal is not stuck behind element.style.
    from.style.visibility = "";
  };

  let flight: Animation;
  try {
    flight = ghost.animate(frames, {
      duration: FLIGHT_MS,
      easing: EASE,
      fill: "forwards",
    });
  } catch {
    revealSource();
    ghost.remove();
    return Promise.resolve();
  }

  const cleanup = () => {
    revealSource();
    ghost.remove();
    if (to.isConnected) bumpGradeMailbox(to, { rating, intensity: "light" });
  };

  return flight.finished.then(cleanup, cleanup);
}

export function bumpGradeMailbox(
  to: HTMLElement,
  opts: { rating: StudyRating; intensity?: "strong" | "light" },
): void {
  const intensity = opts.intensity ?? "strong";
  const peak = intensity === "strong" ? 1.1 : 1.05;
  const wash = gradeColorVars(opts.rating).wash;

  if (prefersReducedMotion()) {
    try {
      to.animate(
        [
          { filter: "brightness(1)" },
          { filter: "brightness(1.25)" },
          { filter: "brightness(1)" },
        ],
        { duration: 160, easing: "ease-out" },
      );
    } catch {
      // WAAPI missing: skip visual bump only.
    }
    return;
  }

  const brightness = intensity === "strong" ? 1.2 : 1.1;
  const mid: Keyframe = {
    transform: `scale(${peak})`,
    filter: `brightness(${brightness})`,
  };
  if (wash) mid.boxShadow = `inset 0 0 0 999px ${wash}`;
  try {
    to.animate(
      [
        { transform: "scale(1)", boxShadow: "none", filter: "brightness(1)" },
        mid,
        { transform: "scale(1)", boxShadow: "none", filter: "brightness(1)" },
      ],
      {
        duration: intensity === "strong" ? BUMP_MS : Math.round(BUMP_MS * 0.75),
        easing: ARRIVE_EASE,
      },
    );
  } catch {
    // WAAPI missing: skip visual bump only.
  }
}
