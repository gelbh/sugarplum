/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import GradeMixChart from "../../src/insights/GradeMixChart";
import ReviewsPerDayChart from "../../src/insights/ReviewsPerDayChart";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("insights charts", () => {
  let host: HTMLDivElement | null = null;
  const theme = createTheme();
  let prevWidth: PropertyDescriptor | undefined;
  let prevHeight: PropertyDescriptor | undefined;
  let prevRO: typeof ResizeObserver | undefined;

  beforeEach(() => {
    prevWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    prevHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 180,
    });
    prevRO = globalThis.ResizeObserver;
    if (!prevRO) {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    }
  });

  afterEach(() => {
    if (host) {
      host.remove();
      host = null;
    }
    if (prevWidth) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", prevWidth);
    } else {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
    if (prevHeight) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", prevHeight);
    } else {
      delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
    }
    if (prevRO) {
      globalThis.ResizeObserver = prevRO;
    } else {
      delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    }
  });

  function renderChart(node: ReactElement) {
    host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    return { root, node: createElement(ThemeProvider, { theme }, node) };
  }

  it("ReviewsPerDayChart empty caption and img role", async () => {
    const series = Array.from({ length: 30 }, (_, i) => ({
      day: `2026-10-${String(i + 1).padStart(2, "0")}`,
      count: 0,
    }));
    const { root, node } = renderChart(
      createElement(ReviewsPerDayChart, { series }),
    );
    await act(async () => {
      root.render(node);
    });
    const img = host!.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toMatch(/No reviews/i);
    expect(host!.textContent).toMatch(/No reviews in this window/i);
    await act(async () => {
      root.unmount();
    });
  });

  it("GradeMixChart names counts when nonzero", async () => {
    const { root, node } = renderChart(
      createElement(GradeMixChart, {
        counts: { again: 2, hard: 1, good: 3, easy: 0 },
      }),
    );
    await act(async () => {
      root.render(node);
    });
    const img = host!.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toMatch(/2/);
    expect(host!.textContent).toMatch(/6 grades/);
    await act(async () => {
      root.unmount();
    });
  });
});
