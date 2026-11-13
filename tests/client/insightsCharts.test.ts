/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import GradeMixChart from "../../src/insights/GradeMixChart";
import ReviewsPerDayChart from "../../src/insights/ReviewsPerDayChart";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("insights charts", () => {
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (host) {
      host.remove();
      host = null;
    }
  });

  it("ReviewsPerDayChart empty caption and img role", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const series = Array.from({ length: 30 }, (_, i) => ({
      day: `2026-10-${String(i + 1).padStart(2, "0")}`,
      count: 0,
    }));
    await act(async () => {
      root.render(createElement(ReviewsPerDayChart, { series }));
    });
    const img = host.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toMatch(/No reviews/i);
    expect(host.textContent).toMatch(/No reviews in this window/i);
    await act(async () => {
      root.unmount();
    });
  });

  it("GradeMixChart names counts when nonzero", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(GradeMixChart, {
          counts: { again: 2, hard: 1, good: 3, easy: 0 },
        }),
      );
    });
    const img = host.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toMatch(/2/);
    expect(host.textContent).toMatch(/6 grades/);
    await act(async () => {
      root.unmount();
    });
  });
});
