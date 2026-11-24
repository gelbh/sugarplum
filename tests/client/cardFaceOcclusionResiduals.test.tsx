/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardFace from "../../src/study/faces/CardFace";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../src/api/client")>(
    "../../src/api/client",
  );
  return {
    ...actual,
    mediaUrl: (key: string) => `https://example.test/${key}`,
  };
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("CardFace occlusion residuals", () => {
  it("omits blank prompt and uses opaque Anki-width-fit shell", () => {
    act(() => {
      root.render(
        createElement(CardFace, {
          front: "",
          back: "Heart",
          type: "occlusion",
          revealed: false,
          onReveal: () => undefined,
          onFlipBack: () => undefined,
          occlusion: {
            imageKey: "diagram.png",
            mask: { x: 0.1, y: 0.2, w: 0.3, h: 0.15 },
          },
        }),
      );
    });

    expect(host.textContent).not.toContain("Identify the hidden region");
    const mask = host.querySelector("[data-occlusion-mask]");
    expect(mask).toBeTruthy();
    // Emotion styles live in <style>; assert the residual CSS left the old translucency.
    const styleText = [...document.querySelectorAll("style")]
      .map((el) => el.textContent ?? "")
      .join("\n");
    expect(styleText).not.toContain(
      "color-mix(in srgb, var(--sp-stage-bg) 92%, transparent)",
    );
    expect(styleText).toContain("var(--sp-stage-bg)");
    expect(styleText).toContain("70vh");
    expect(styleText).not.toContain("36vh");

    const shell = mask?.parentElement?.parentElement as HTMLElement | null;
    expect(shell).toBeTruthy();
  });

  it("shows an authored prompt when present", () => {
    act(() => {
      root.render(
        createElement(CardFace, {
          front: "Name this structure",
          back: "Heart",
          type: "occlusion",
          revealed: false,
          onReveal: () => undefined,
          onFlipBack: () => undefined,
          occlusion: {
            imageKey: "diagram.png",
            mask: { x: 0.1, y: 0.2, w: 0.3, h: 0.15 },
          },
        }),
      );
    });
    expect(host.textContent).toContain("Name this structure");
  });
});
