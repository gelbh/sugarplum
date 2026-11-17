/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MagazineEmptyStage from "../../src/library/MagazineEmptyStage";
import { theme } from "../../src/theme";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      matches: false,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(createElement(ThemeProvider, { theme }, node));
  });
}

describe("MagazineEmptyStage", () => {
  it("renders Get started chrome, title, description, and create tile", async () => {
    const onCreate = vi.fn();
    await render(
      createElement(MagazineEmptyStage, {
        title: "Start with a subject",
        description: "Subjects group your decks.",
        boardAriaLabel: "Subjects",
        create: {
          title: "New subject",
          meta: "Name it, then add decks inside",
          openLabel: "New subject",
          onCreate,
        },
      }),
    );

    expect(document.body.textContent).toContain("Get started");
    expect(document.body.textContent).toContain("Start with a subject");
    expect(document.body.textContent).toContain("Subjects group your decks.");
    expect(
      document.querySelector('[aria-label="Subjects"]'),
    ).not.toBeNull();

    const createButton = document.querySelector('[aria-label="New subject"]');
    expect(createButton).not.toBeNull();
    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("omits create tile when create is omitted", async () => {
    await render(
      createElement(MagazineEmptyStage, {
        title: "Add your first deck",
        description: "Decks hold the cards.",
        boardAriaLabel: "Decks",
      }),
    );

    expect(document.body.textContent).toContain("Add your first deck");
    expect(document.querySelector('[aria-label="New deck"]')).toBeNull();
  });
});
