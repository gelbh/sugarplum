/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import GradeButtons from "../../src/study/grading/GradeButtons";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

async function renderAt(matchesDownMd: boolean) {
  mockMatchMedia(matchesDownMd);
  const theme = createTheme();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(
        ThemeProvider,
        { theme },
        createElement(GradeButtons, { onGrade: () => undefined }),
      ),
    );
  });
  // MUI useMediaQuery may subscribe after first paint under load
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { host, root };
}

describe("GradeButtons mobile digits", () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => {
        root.unmount();
      });
    }
    document.body.replaceChildren();
  });

  it("hides hanging digit tabs below md", async () => {
    const { host } = await renderAt(true);
    await vi.waitFor(() => {
      expect(host.querySelectorAll("[data-grade-digit]")).toHaveLength(0);
    });
  });

  it("shows hanging digit tabs at md and up", async () => {
    const { host } = await renderAt(false);
    await vi.waitFor(() => {
      expect(host.querySelectorAll("[data-grade-digit]")).toHaveLength(4);
    });
  });
});
