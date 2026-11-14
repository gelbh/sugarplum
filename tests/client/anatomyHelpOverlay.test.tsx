/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import AnatomyHelpOverlay from "../../src/anatomy/AnatomyHelpOverlay";

async function renderOverlay(touch: boolean) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(AnatomyHelpOverlay, {
          open: true,
          onClose: () => undefined,
          touch,
        }),
      ),
    );
  });
  return { host, root };
}

describe("AnatomyHelpOverlay", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("lists pinch / one-finger orbit when touch", async () => {
    const { host } = await renderOverlay(true);
    expect(host.textContent).toMatch(/Pinch/i);
    expect(host.textContent).toMatch(/One-finger/i);
    expect(host.textContent).not.toMatch(/Right-drag/i);
  });

  it("lists right-drag and keys when not touch", async () => {
    const { host } = await renderOverlay(false);
    expect(host.textContent).toMatch(/Right-drag/i);
    expect(host.textContent).toMatch(/Hide selected/);
    expect(host.textContent).toMatch(/Isolate selected/);
  });
});

