/** @vitest-environment jsdom */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, describe, expect, it, vi } from "vitest";
import GradeButtons from "../../src/components/GradeButtons";

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
  root.render(
    createElement(
      ThemeProvider,
      { theme },
      createElement(GradeButtons, { onGrade: () => undefined }),
    ),
  );
  await Promise.resolve();
  // MUI useMediaQuery may subscribe async
  await new Promise((r) => setTimeout(r, 0));
  return { host, root };
}

describe("GradeButtons mobile digits", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("hides hanging digit tabs below md", async () => {
    const { host } = await renderAt(true);
    expect(host.querySelectorAll("[data-grade-digit]")).toHaveLength(0);
  });

  it("shows hanging digit tabs at md and up", async () => {
    const { host } = await renderAt(false);
    expect(host.querySelectorAll("[data-grade-digit]")).toHaveLength(4);
  });
});
