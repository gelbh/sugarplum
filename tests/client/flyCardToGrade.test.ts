/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bumpGradeMailbox,
  flyCardToGrade,
  gradeMailboxEl,
  prefersReducedMotion,
  studyCardFlightSource,
} from "../../src/study/grading/flyCardToGrade";

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
    expect(ghost?.style.backgroundColor).not.toBe("transparent");
    expect(ghost?.style.boxShadow).toContain("--sp-grade-easy-border");
    expect(ghost?.textContent).toContain("card");
    expect(from.style.visibility).toBe("hidden");
    resolveFlight();
    await flight;
    Element.prototype.animate = origAnimate;
    expect(document.querySelector("[data-grade-flight-ghost]")).toBeNull();
    // Inline hide must clear: FlipCardPlate reuses faces and sx cannot override it.
    expect(from.style.visibility).toBe("");
    // Depart strong + arrive light while mailbox stays connected.
    expect(bumpAnimate).toHaveBeenCalledTimes(2);
  });

  it("clears source visibility if ghost.animate throws", async () => {
    stubMotion(false);
    const from = document.createElement("div");
    from.className = "sp-playing-card";
    const to = document.createElement("div");
    to.setAttribute("data-grade-mailbox", "3");
    document.body.append(from, to);
    stubRects(from, to);
    to.animate = vi.fn(() => ({ finished: Promise.resolve() })) as unknown as typeof to.animate;
    Element.prototype.animate = () => {
      throw new Error("waapi missing");
    };

    await flyCardToGrade(from, to, { rating: 3 });
    expect(from.style.visibility).toBe("");
    expect(document.querySelector("[data-grade-flight-ghost]")).toBeNull();
  });

  it("strong mailbox bump peaks at 1.1 with grade wash and brightness", () => {
    stubMotion(false);
    const to = document.createElement("div");
    document.body.append(to);
    const animate = vi.fn(() => ({ finished: Promise.resolve() }));
    to.animate = animate as unknown as typeof to.animate;

    bumpGradeMailbox(to, { rating: 3, intensity: "strong" });

    expect(animate).toHaveBeenCalledTimes(1);
    const [frames] = animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
    const peak = frames[1];
    expect(String(peak.transform)).toContain("scale(1.1)");
    expect(String(peak.boxShadow)).toContain("--sp-grade-good-wash");
    expect(String(peak.filter)).toContain("brightness(1.2)");
  });

  it("light mailbox bump peaks softer than strong", () => {
    stubMotion(false);
    const to = document.createElement("div");
    document.body.append(to);
    const animate = vi.fn(() => ({ finished: Promise.resolve() }));
    to.animate = animate as unknown as typeof to.animate;

    bumpGradeMailbox(to, { rating: 1, intensity: "light" });

    const [frames] = animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(String(frames[1].transform)).toContain("scale(1.05)");
  });
});
