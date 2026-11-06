/**
 * @vitest-environment jsdom
 */
import { act, createElement, type MouseEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import ShelfVolume from "../../src/components/ShelfVolume";
import { libraryShowsCreateFlow } from "../../src/library/libraryCreateFlow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderVolume(select?: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
  inputLabel: string;
}): HTMLDivElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);
  act(() => {
    root.render(
      createElement(ShelfVolume, {
        title: "Anatomy",
        href: "/library/subjects/sub-1",
        onNavigate: (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault(),
        meta: "2 decks",
        studyLabel: "Study",
        onStudy: () => {},
        moreLabel: "More actions for Anatomy",
        onMore: () => {},
        select,
      }),
    );
  });
  return host;
}

describe("libraryShowsCreateFlow", () => {
  it("opens the wizard only when there are no subjects", () => {
    expect(libraryShowsCreateFlow(0)).toBe(true);
    expect(libraryShowsCreateFlow(1)).toBe(false);
  });
});

describe("ShelfVolume", () => {
  it("shows the title, meta, Study, and More", () => {
    const host = renderVolume();
    expect(host.textContent).toContain("Anatomy");
    expect(host.textContent).toContain("2 decks");
    expect(host.querySelector("a")?.getAttribute("aria-label")).toBe("Open Anatomy");
    expect(host.querySelector('[aria-label="Study"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="More actions for Anatomy"]')).toBeTruthy();
    host.remove();
  });

  it("hides Study and More while selecting", () => {
    const host = renderVolume({
      checked: false,
      onChange: () => {},
      inputLabel: "Select all decks in Anatomy",
    });
    expect(host.querySelector('[aria-label="Study"]')).toBeNull();
    expect(host.querySelector('[aria-label="More actions for Anatomy"]')).toBeNull();
    expect(host.querySelector('input[type="checkbox"]')).toBeTruthy();
    host.remove();
  });
});
