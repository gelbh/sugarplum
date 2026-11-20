/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it } from "vitest";
import AnatomyClipHud from "../../src/anatomy/viewer/AnatomyClipHud";

async function renderHud(props: {
  activeClipId: string | null;
  activeLabel: string | null;
  clipPaused: boolean;
  clipError?: string | null;
}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme: createTheme() },
        createElement(AnatomyClipHud, {
          activeClipId: props.activeClipId,
          activeLabel: props.activeLabel,
          clipPaused: props.clipPaused,
          clipError: props.clipError ?? null,
          disabled: false,
          onTogglePause: () => undefined,
        }),
      ),
    );
  });
  return { host, root };
}

describe("AnatomyClipHud", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders nothing when no active clip", async () => {
    const { host } = await renderHud({
      activeClipId: null,
      activeLabel: null,
      clipPaused: false,
    });
    expect(host.textContent).toBe("");
  });

  it("shows label and pause control when a clip is active", async () => {
    const { host } = await renderHud({
      activeClipId: "falcine",
      activeLabel: "Falcine",
      clipPaused: false,
    });
    expect(host.textContent).toMatch(/Falcine/);
    expect(
      host.querySelector('[aria-label="Pause clip"]'),
    ).not.toBeNull();
  });

  it("shows resume when paused", async () => {
    const { host } = await renderHud({
      activeClipId: "falcine",
      activeLabel: "Falcine",
      clipPaused: true,
    });
    expect(
      host.querySelector('[aria-label="Resume clip"]'),
    ).not.toBeNull();
  });
});
