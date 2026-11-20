/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import DistributionSilhouette from "../../src/atlas/hub/DistributionSilhouette";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const roots: Root[] = [];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

async function renderMap() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(DistributionSilhouette, {
          text: "Temperate Europe",
          worldwide: false,
          regions: ["europe"],
          bands: [],
        }),
      ),
    );
  });
  return host;
}

const toggle = (host: HTMLElement) =>
  [...host.querySelectorAll("button")].find((b) =>
    /map/i.test(b.textContent ?? ""),
  )!;

describe("DistributionSilhouette collapse", () => {
  it("starts collapsed with chips and text but no map", async () => {
    const host = await renderMap();
    expect(host.querySelector('[role="img"]')).toBeNull();
    expect(host.textContent).toContain("Temperate Europe");
    expect(toggle(host).textContent).toBe("Show map");
    expect(toggle(host).getAttribute("aria-expanded")).toBe("false");
  });

  it("mounts the map on Show map and remembers it", async () => {
    const host = await renderMap();
    await act(async () => {
      toggle(host).click();
    });
    expect(host.querySelector('[role="img"]')).toBeTruthy();
    expect(toggle(host).textContent).toBe("Hide map");
    expect(toggle(host).getAttribute("aria-expanded")).toBe("true");
    expect(localStorage.getItem("sugarplum.atlas.mapOpen")).toBe("1");

    const again = await renderMap();
    expect(again.querySelector('[role="img"]')).toBeTruthy();
  });
});
