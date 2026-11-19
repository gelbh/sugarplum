/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import { bundledAtlasSource } from "../../src/atlas/bundledSource";
import LifecycleBoard from "../../src/atlas/LifecycleBoard";
import { theme } from "../../src/theme";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const entries = await bundledAtlasSource.list("subj_1");
const fields = (
  entries.find((e) => e.id === "entamoeba-histolytica") ??
  entries.find((e) => e.id === "demodex-canis") ??
  entries[0]!
).fields;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

async function renderBoard() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme },
        createElement(LifecycleBoard, { fields }),
      ),
    );
  });
}

describe("LifecycleBoard look-and-feel", () => {
  it("has no bottom stage list; stage name leads with N / M near transport", async () => {
    await renderBoard();
    expect(
      document.querySelector('[aria-label="Lifecycle stages"]'),
    ).toBeNull();
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent ?? "").not.toMatch(/Step \d+ of \d+/);
    expect(live?.textContent ?? "").not.toMatch(/Now,/);
    expect(live?.textContent ?? "").toMatch(/\d+ of \d+/);
    expect(document.body.textContent ?? "").toMatch(/\d+ \/ \d+/);
    expect(
      document.querySelector(
        'button[aria-label="Play lifecycle"], button[aria-label="Pause lifecycle"]',
      ),
    ).toBeTruthy();
  });

  it("uses compact play control (not a contained CTA)", async () => {
    await renderBoard();
    const play = document.querySelector(
      'button[aria-label="Play lifecycle"], button[aria-label="Pause lifecycle"]',
    );
    expect(play).toBeTruthy();
    expect(play!.className).not.toMatch(/MuiButton-contained/);
  });

  it("keeps long transmission out of swimlane cells", async () => {
    await renderBoard();
    const transmission = fields.lifecycleStages.find((s) => s.transmission)
      ?.transmission;
    expect(transmission).toBeTruthy();
    // Stage cells are ButtonBase; play/prev/next are also buttons.
    const stageCell = Array.from(document.querySelectorAll("button")).find(
      (b) =>
        (b.getAttribute("aria-current") === "step" ||
          /^\d/.test((b.textContent ?? "").trim())) &&
        !/Play lifecycle|Pause|Previous|Next/i.test(b.textContent ?? ""),
    );
    expect(stageCell).toBeTruthy();
    expect(stageCell!.textContent ?? "").not.toContain(transmission!);
  });

  it("keeps the infection axis free of stage day-span labels", async () => {
    await renderBoard();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/from infection/i);
    expect(text).not.toMatch(/Days?s? \d+ to \d+/);
    expect(text).not.toMatch(/Weeks? \d+ onwards/);
  });
});
