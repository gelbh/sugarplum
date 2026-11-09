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

  it("shows the stored cover and Unsplash attribution", () => {
    const imageUrl = "https://images.unsplash.com/photo-1?ixid=keep-me&w=400";
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
          cover: {
            imageUrl,
            photographerName: "Ada",
            photographerUrl: "https://unsplash.com/@ada",
            photoHtmlUrl: "https://unsplash.com/photos/abc",
          },
        }),
      );
    });
    expect(host.querySelector("img")?.getAttribute("src")).toBe(imageUrl);
    const links = [...host.querySelectorAll("a")];
    const ada = links.find((link) => link.textContent === "Ada");
    const unsplash = links.find((link) => link.textContent === "Unsplash");
    expect(ada?.getAttribute("href")).toContain("utm_source=sugarplum");
    expect(ada?.getAttribute("href")).toContain("utm_medium=referral");
    expect(unsplash?.textContent).toBe("Unsplash");
    expect(unsplash?.getAttribute("href")).toContain("utm_source=sugarplum");
    expect(unsplash?.getAttribute("href")).toContain("utm_medium=referral");
    host.remove();
  });

  it("renders spark under chip when provided", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root: Root = createRoot(host);
    act(() => {
      root.render(
        createElement(ShelfVolume, {
          title: "Anatomy",
          href: "/library/subjects/sub-1",
          onNavigate: (event: MouseEvent<HTMLAnchorElement>) =>
            event.preventDefault(),
          meta: "2 decks",
          chip: "50% graduated",
          spark: createElement("div", {
            "data-testid": "spark",
            children: "spark",
          }),
          studyLabel: "Study",
          onStudy: () => {},
          moreLabel: "More actions for Anatomy",
          onMore: () => {},
        }),
      );
    });
    expect(host.textContent).toContain("50% graduated");
    expect(host.querySelector('[data-testid="spark"]')).toBeTruthy();
    host.remove();
  });

  it("renders recall chip with tooltip text", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root: Root = createRoot(host);
    act(() => {
      root.render(
        createElement(ShelfVolume, {
          title: "Anatomy",
          href: "/library/subjects/sub-1",
          onNavigate: (event: MouseEvent<HTMLAnchorElement>) =>
            event.preventDefault(),
          meta: "2 decks",
          chip: "50% graduated",
          recallChip: "42% recall",
          recallTooltip: "~1.2 card-equivalents",
          studyLabel: "Study",
          onStudy: () => {},
          moreLabel: "More actions for Anatomy",
          onMore: () => {},
        }),
      );
    });
    expect(host.textContent).toContain("50% graduated");
    expect(host.textContent).toContain("42% recall");
    host.remove();
  });
});
