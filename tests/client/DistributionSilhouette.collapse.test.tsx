/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DistributionSilhouette from "../../src/atlas/hub/DistributionSilhouette";
import { MAP_OPEN_STORAGE_KEY } from "../../src/atlas/hub/mapOpenPref";

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

function toggle(host: HTMLElement): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>("button[aria-expanded]");
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

async function waitForMap(host: HTMLElement) {
  await vi.waitFor(() => {
    expect(host.querySelector('[role="img"]')).toBeTruthy();
  });
}

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
    await waitForMap(host);
    expect(toggle(host).textContent).toBe("Hide map");
    expect(toggle(host).getAttribute("aria-expanded")).toBe("true");
    expect(localStorage.getItem(MAP_OPEN_STORAGE_KEY)).toBe("1");

    const again = await renderMap();
    await waitForMap(again);
  });

  it("unmounts the map on Hide map and remembers it", async () => {
    const host = await renderMap();
    await act(async () => {
      toggle(host).click();
    });
    await waitForMap(host);
    await act(async () => {
      toggle(host).click();
    });
    expect(localStorage.getItem(MAP_OPEN_STORAGE_KEY)).toBe("0");
    expect(host.querySelector('[role="img"]')).toBeNull();
    expect(toggle(host).textContent).toBe("Show map");
  });

  it("shows the map after mount when the stored preference is open", async () => {
    localStorage.setItem(MAP_OPEN_STORAGE_KEY, "1");
    const host = await renderMap();
    await waitForMap(host);
    expect(toggle(host).getAttribute("aria-expanded")).toBe("true");
  });
});
