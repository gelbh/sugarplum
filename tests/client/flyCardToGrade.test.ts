/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flyCardToGrade,
  gradeMailboxEl,
  prefersReducedMotion,
  studyCardFlightSource,
} from "../../src/study/flyCardToGrade";

function stubMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && String(query).includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function stubRects(from: HTMLElement, to: HTMLElement) {
  from.getBoundingClientRect = () =>
    ({
      left: 20,
      top: 30,
      width: 180,
      height: 250,
      right: 200,
      bottom: 280,
      x: 20,
      y: 30,
      toJSON: () => ({}),
    }) as DOMRect;
  to.getBoundingClientRect = () =>
    ({
      left: 220,
      top: 420,
      width: 70,
      height: 70,
      right: 290,
      bottom: 490,
      x: 220,
      y: 420,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe("flyCardToGrade helpers", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prefers the innermost visible face (React omits aria-hidden=false)", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="sp-playing-card">
        <div class="sp-playing-card" aria-hidden="true"></div>
        <div class="sp-playing-card" data-face="back"></div>
      </div>
    `;
    expect(studyCardFlightSource(host)?.getAttribute("data-face")).toBe("back");
  });

  it("finds the grade mailbox by rating", () => {
    document.body.innerHTML = `
      <div data-grade-mailbox="1"></div>
      <div data-grade-mailbox="3" id="good"></div>
    `;
    expect(gradeMailboxEl(3)?.id).toBe("good");
    expect(gradeMailboxEl(4)).toBeNull();
  });

  it("skips flight under prefers-reduced-motion and still bumps", async () => {
    stubMotion(true);
    expect(prefersReducedMotion()).toBe(true);

    const from = document.createElement("div");
    from.className = "sp-playing-card";
    const to = document.createElement("div");
    to.setAttribute("data-grade-mailbox", "2");
    document.body.append(from, to);
    stubRects(from, to);

    const animate = vi.fn(() => ({ finished: Promise.resolve() }));
    to.animate = animate as unknown as typeof to.animate;

    await flyCardToGrade(from, to, { rating: 2 });
    expect(animate).toHaveBeenCalled();
    expect(document.querySelector("[data-grade-flight-ghost]")).toBeNull();
  });

  it("appends a solid flying ghost with grade rim then removes it", async () => {
    stubMotion(false);

    const from = document.createElement("div");
    from.className = "sp-playing-card";
    from.textContent = "card";
    const to = document.createElement("div");
    to.setAttribute("data-grade-mailbox", "4");
    document.body.append(from, to);
    stubRects(from, to);

    let resolveFlight!: () => void;
    const finished = new Promise<void>((r) => {
      resolveFlight = r;
    });
    const ghostAnimate = vi.fn(() => ({ finished }));
    const bumpAnimate = vi.fn(() => ({ finished: Promise.resolve() }));
    to.animate = bumpAnimate as unknown as typeof to.animate;

    const origAnimate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: unknown[]) {
      if (this !== to) {
        return ghostAnimate(...args) as Animation;
      }
      return bumpAnimate(...args) as Animation;
    } as typeof Element.prototype.animate;

    const flight = flyCardToGrade(from, to, { rating: 4 });
    const ghost = document.querySelector<HTMLElement>("[data-grade-flight-ghost]");
    expect(ghost).not.toBeNull();
    expect(ghost?.dataset.gradeRating).toBe("4");
    expect(ghost?.style.background).toContain("--sp-card-face");
    expect(ghost?.style.boxShadow).toContain("--sp-grade-easy-border");
    resolveFlight();
    await flight;
    Element.prototype.animate = origAnimate;
    expect(document.querySelector("[data-grade-flight-ghost]")).toBeNull();
    expect(bumpAnimate).toHaveBeenCalled();
  });
});
