/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import ActivityHeatmap from "../../src/insights/ActivityHeatmap";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("ActivityHeatmap", () => {
  let host: HTMLDivElement | null = null;
  const theme = createTheme();

  afterEach(() => {
    if (host) {
      host.remove();
      host = null;
    }
  });

  function renderChart(node: ReactElement) {
    host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    return { root, node: createElement(ThemeProvider, { theme }, node) };
  }

  function daySeries(counts: readonly number[]) {
    const start = Date.UTC(2026, 7, 17, 12, 0, 0);
    return counts.map((count, i) => {
      const d = new Date(start + i * 86_400_000);
      const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      return { day, count };
    });
  }

  it("empty series shows calm caption and img role", async () => {
    const series = daySeries(Array.from({ length: 90 }, () => 0));
    const { root, node } = renderChart(
      createElement(ActivityHeatmap, { series }),
    );
    await act(async () => {
      root.render(node);
    });
    const img = host!.querySelector('[role="img"]');
    expect(img).toBeTruthy();
    expect(img!.getAttribute("aria-label")).toMatch(/no review activity/i);
    expect(host!.textContent).toMatch(/no review activity in this window yet/i);
  });

  it("nonzero series caption reflects active days and total", async () => {
    const counts = Array.from({ length: 90 }, () => 0);
    counts[88] = 1;
    counts[89] = 3;
    const series = daySeries(counts);
    const { root, node } = renderChart(
      createElement(ActivityHeatmap, { series }),
    );
    await act(async () => {
      root.render(node);
    });
    const img = host!.querySelector('[role="img"]');
    expect(img).toBeTruthy();
    expect(img!.getAttribute("aria-label")).toMatch(/2 active days/i);
    expect(img!.getAttribute("aria-label")).toMatch(/4 reviews/i);
    expect(host!.textContent).toMatch(/2 active days/i);
    expect(host!.textContent).toMatch(/4 reviews/i);
    expect(host!.querySelectorAll("rect").length).toBeGreaterThan(0);
  });
});
