/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import DifficultyStabilityBlock from "../../src/insights/DifficultyStabilityBlock";
import SubjectDifficultyStabilityList from "../../src/insights/SubjectDifficultyStabilityList";
import FutureDueChart from "../../src/insights/FutureDueChart";
import HourlySuccessChart from "../../src/insights/HourlySuccessChart";
import GradeMixByMaturityChart from "../../src/insights/GradeMixByMaturityChart";
import GradeMixChart from "../../src/insights/GradeMixChart";
import ReviewsPerDayChart from "../../src/insights/ReviewsPerDayChart";
import { gradeChartFill } from "../../src/study/gradeColors";

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

  it("gradeChartFill uses brand spectrum hexes not MUI traffic lights", () => {
    expect(gradeChartFill(1)).toBe("#c45c6a");
    expect(gradeChartFill(2)).toBe("#c4a574");
    expect(gradeChartFill(3)).toBe("#8b5a9e");
    expect(gradeChartFill(4)).toBe("#6a9e8b");
  });

  it("FutureDueChart empty caption and img role", async () => {
    const series = Array.from({ length: 14 }, (_, i) => ({
      day: `2026-11-${String(i + 1).padStart(2, "0")}`,
      count: 0,
    }));
    const { root, node } = renderChart(
      createElement(FutureDueChart, { series }),
    );
    await act(async () => {
      root.render(node);
    });
    const img = host!.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toMatch(/No upcoming due/i);
    expect(host!.textContent).toMatch(/No cards due in the next 14 days/i);
    await act(async () => {
      root.unmount();
    });
  });

  it("FutureDueChart renders peak caption when nonzero", async () => {
    const series = Array.from({ length: 14 }, (_, i) => ({
      day: `2026-11-${String(i + 1).padStart(2, "0")}`,
      count: i === 2 ? 5 : 0,
    }));
    const { root, node } = renderChart(
      createElement(FutureDueChart, { series }),
    );
    await act(async () => {
      root.render(node);
    });
    expect(host!.textContent).toMatch(/5 due/);
    expect(host!.textContent).toMatch(/peak 5\/day/);
    await act(async () => {
      root.unmount();
    });
  });

  it("HourlySuccessChart empty caption and img role", async () => {
    const series = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      pass: 0,
      fail: 0,
      rate: null as number | null,
    }));
    const { root, node } = renderChart(
      createElement(HourlySuccessChart, { series }),
    );
    await act(async () => {
      root.render(node);
    });
    const img = host!.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toMatch(/No reviews/i);
    expect(host!.textContent).toMatch(/No reviews yet to chart by hour/i);
    await act(async () => {
      root.unmount();
    });
  });

  it("HourlySuccessChart labels success strip when nonzero", async () => {
    const series = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      pass: hour === 9 ? 2 : 0,
      fail: hour === 9 ? 1 : 0,
      rate: hour === 9 ? 2 / 3 : (null as number | null),
    }));
    const { root, node } = renderChart(
      createElement(HourlySuccessChart, { series }),
    );
    await act(async () => {
      root.render(node);
    });
    const img = host!.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toMatch(/3 reviews/i);
    expect(host!.textContent).toMatch(/Success by hour/i);
    await act(async () => {
      root.unmount();
    });
  });

  it("GradeMixByMaturityChart empty caption", async () => {
    const empty = { again: 0, hard: 0, good: 0, easy: 0 };
    const { root, node } = renderChart(
      createElement(GradeMixByMaturityChart, {
        byMaturity: { young: empty, mature: empty, learning: empty },
      }),
    );
    await act(async () => {
      root.render(node);
    });
    const img = host!.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toMatch(/No maturity-split/i);
    expect(host!.textContent).toMatch(/No young, mature, or learning grades/i);
    await act(async () => {
      root.unmount();
    });
  });

  it("GradeMixByMaturityChart names stacked totals when nonzero", async () => {
    const { root, node } = renderChart(
      createElement(GradeMixByMaturityChart, {
        byMaturity: {
          young: { again: 1, hard: 0, good: 2, easy: 0 },
          mature: { again: 0, hard: 1, good: 0, easy: 1 },
          learning: { again: 0, hard: 0, good: 1, easy: 0 },
        },
      }),
    );
    await act(async () => {
      root.render(node);
    });
    expect(host!.textContent).toMatch(/6 grades split by maturity/);
    await act(async () => {
      root.unmount();
    });
  });

  it("DifficultyStabilityBlock empty caption", async () => {
    const { root, node } = renderChart(
      createElement(DifficultyStabilityBlock, {
        difficulty: { easy: 0, medium: 0, hard: 0, total: 0 },
        stability: {
          medianDays: null,
          bins: [
            { label: "<1d", count: 0 },
            { label: "1–7d", count: 0 },
            { label: "7–21d", count: 0 },
            { label: "21d+", count: 0 },
          ],
        },
      }),
    );
    await act(async () => {
      root.render(node);
    });
    expect(host!.textContent).toMatch(/Grade accepted cards to see FSRS/i);
    await act(async () => {
      root.unmount();
    });
  });

  it("DifficultyStabilityBlock shows median and bin labels", async () => {
    const { root, node } = renderChart(
      createElement(DifficultyStabilityBlock, {
        difficulty: { easy: 2, medium: 1, hard: 1, total: 4 },
        stability: {
          medianDays: 12.5,
          bins: [
            { label: "<1d", count: 1 },
            { label: "1–7d", count: 2 },
            { label: "7–21d", count: 1 },
            { label: "21d+", count: 0 },
          ],
        },
      }),
    );
    await act(async () => {
      root.render(node);
    });
    expect(host!.textContent).toMatch(/Median stability 12\.5d/);
    expect(host!.textContent).toMatch(/Easy 2/);
    expect(host!.textContent).toMatch(/1–7d/);
    await act(async () => {
      root.unmount();
    });
  });

  it("SubjectDifficultyStabilityList renders titles and medians", async () => {
    const { root, node } = renderChart(
      createElement(SubjectDifficultyStabilityList, {
        rows: [
          {
            subjectId: "a",
            title: "Anatomy",
            difficulty: { easy: 1, medium: 0, hard: 1, total: 2 },
            medianStabilityDays: 4.5,
          },
        ],
      }),
    );
    await act(async () => {
      root.render(node);
    });
    expect(host!.textContent).toMatch(/By subject/);
    expect(host!.textContent).toMatch(/Anatomy/);
    expect(host!.textContent).toMatch(/Median 4\.5d/);
    await act(async () => {
      root.unmount();
    });
  });

  it("SubjectDifficultyStabilityList renders nothing when empty", async () => {
    const { root, node } = renderChart(
      createElement(SubjectDifficultyStabilityList, { rows: [] }),
    );
    await act(async () => {
      root.render(node);
    });
    expect(host!.textContent ?? "").toBe("");
    await act(async () => {
      root.unmount();
    });
  });
});
