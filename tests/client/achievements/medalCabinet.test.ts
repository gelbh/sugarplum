/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MedalCabinet from "../../../src/achievements/MedalCabinet";
import type { AchievementItem, AchievementProgress } from "../../../src/achievements/wire";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function medal(
  partial: Pick<AchievementItem["def"], "id" | "title" | "fruitType" | "sortOrder" | "description"> & {
    completedAt?: string | null;
    progress?: AchievementProgress;
  },
): AchievementItem {
  return {
    def: {
      id: partial.id,
      category: "reviews",
      fruitType: partial.fruitType,
      rarity: "common",
      title: partial.title,
      description: partial.description,
      sortOrder: partial.sortOrder,
    },
    progress: partial.progress ?? null,
    completedAt: partial.completedAt ?? null,
    traits: { shine: "mild", colour: "clearer", status: "ripe" },
  };
}

const apple: AchievementItem[] = [
  medal({
    id: "reviews_1",
    title: "First bite",
    fruitType: "apple",
    sortOrder: 10,
    description: "Complete your first review.",
    completedAt: "2026-01-01T00:00:00.000Z",
  }),
  medal({
    id: "reviews_25",
    title: "Crisp apple",
    fruitType: "apple",
    sortOrder: 20,
    description: "Complete 25 reviews.",
    completedAt: "2026-02-01T00:00:00.000Z",
  }),
  medal({
    id: "reviews_100",
    title: "Orchard regular",
    fruitType: "apple",
    sortOrder: 30,
    description: "Complete 100 reviews.",
    completedAt: "2026-03-01T00:00:00.000Z",
  }),
  medal({
    id: "reviews_500",
    title: "Full bushel",
    fruitType: "apple",
    sortOrder: 140,
    description: "Complete 500 reviews.",
    progress: { kind: "count", currentValue: 180, threshold: 500 },
  }),
  medal({
    id: "reviews_2000",
    title: "Golden apple",
    fruitType: "apple",
    sortOrder: 150,
    description: "Complete 2,000 reviews.",
    progress: { kind: "count", currentValue: 180, threshold: 2000 },
  }),
];

const lemon: AchievementItem[] = [
  medal({
    id: "accepts_1",
    title: "First zest",
    fruitType: "lemon",
    sortOrder: 40,
    description: "Accept your first card.",
    completedAt: "2026-01-01T00:00:00.000Z",
  }),
  medal({
    id: "accepts_100",
    title: "Lemon grove",
    fruitType: "lemon",
    sortOrder: 230,
    description: "Accept 100 cards.",
    progress: { kind: "count", currentValue: 40, threshold: 100 },
  }),
];

const strawberry: AchievementItem[] = [
  medal({
    id: "streak_1",
    title: "First berry",
    fruitType: "strawberry",
    sortOrder: 50,
    description: "Reach a 2-day streak.",
    completedAt: "2026-01-01T00:00:00.000Z",
  }),
];

const plum: AchievementItem[] = [
  medal({
    id: "plum_bud",
    title: "Plum bud",
    fruitType: "plum",
    sortOrder: 111,
    description: "Best streak 3+ and 25 lifetime reviews.",
    progress: {
      kind: "composite",
      parts: [
        { key: "streak_best", current: 1, target: 3 },
        { key: "reviews", current: 10, target: 25 },
      ],
    },
  }),
  medal({
    id: "plum_blossom",
    title: "Plum blossom",
    fruitType: "plum",
    sortOrder: 112,
    description: "Best streak 5+ and 50 lifetime reviews.",
    progress: {
      kind: "composite",
      parts: [
        { key: "streak_best", current: 4, target: 5 },
        { key: "reviews", current: 40, target: 50 },
      ],
    },
  }),
];

const theme = createTheme({ palette: { mode: "dark" } });

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

function render(items: AchievementItem[]) {
  act(() => {
    root.render(
      createElement(
        ThemeProvider,
        { theme },
        createElement(MedalCabinet, { items, sheenIds: new Set<string>() }),
      ),
    );
  });
}

function hostText(): string {
  return host.textContent ?? "";
}

function bodyText(): string {
  return document.body.textContent ?? "";
}

function clickButton(index: number) {
  const button = host.querySelectorAll("button")[index];
  if (!button) throw new Error("missing tile button");
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function closeModal() {
  const backdrop = document.querySelector(".MuiBackdrop-root");
  if (!backdrop) throw new Error("missing dialog backdrop");
  act(() => {
    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function pressEscape() {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) throw new Error("missing dialog");
  act(() => {
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

describe("MedalCabinet", () => {
  it("titles the tile with the highest unlocked medal", () => {
    render(apple);
    expect(hostText()).toContain("Orchard regular");
    expect(hostText()).toContain("3 of 5");
    expect(hostText()).not.toContain("Full bushel");
    expect(hostText().split("Orchard regular").length - 1).toBe(1);
  });

  it("opens a fruit modal with progress, then closes", () => {
    render(apple);
    clickButton(0);
    expect(bodyText()).toContain("Full bushel");
    expect(bodyText()).toContain("180 / 500");
    expect(bodyText()).toContain("Golden apple");
    expect(bodyText()).toContain("Next · Complete 500 reviews.");
    expect(bodyText().split("Orchard regular").length - 1).toBeGreaterThanOrEqual(2);
    closeModal();
    expect(bodyText()).not.toContain("Full bushel");
  });

  it("keeps a single fruit modal open", () => {
    render([...apple, ...lemon]);
    clickButton(0);
    expect(bodyText()).toContain("Full bushel");
    closeModal();
    clickButton(1);
    expect(bodyText()).not.toContain("Full bushel");
    expect(bodyText()).toContain("Lemon grove");
    expect(bodyText()).toContain("40 / 100");
  });

  it("closes the fruit modal on Escape", () => {
    render(apple);
    clickButton(0);
    expect(bodyText()).toContain("Full bushel");
    pressEscape();
    expect(bodyText()).not.toContain("Full bushel");
  });

  it("returns focus to the tile button when the modal closes", () => {
    render(apple);
    const button = host.querySelector("button");
    if (!button) throw new Error("missing tile");
    act(() => {
      button.focus();
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    closeModal();
    expect(document.activeElement).toBe(button);
  });

  it("renders the tile title as a span", () => {
    render(apple);
    const button = host.querySelector("button");
    expect(button?.querySelector("h6")).toBeNull();
    expect(button?.querySelector("span")?.textContent).toContain("Orchard regular");
  });

  it("keeps the grid tile in place when opening a right-column fruit", () => {
    render([...apple, ...lemon]);
    clickButton(1);
    const tiles = host.querySelectorAll(".medal-tile");
    expect(tiles[0]?.textContent).toContain("Orchard regular");
    expect(tiles[1]?.textContent).toContain("First zest");
    expect(tiles[1]?.textContent).not.toContain("Lemon grove");
    expect(bodyText()).toContain("Lemon grove");
  });

  it("keeps the grid tile in place when opening a third-column fruit", () => {
    render([...apple, ...lemon, ...strawberry]);
    clickButton(2);
    const tiles = host.querySelectorAll(".medal-tile");
    expect(tiles[0]?.textContent).toContain("Orchard regular");
    expect(tiles[1]?.textContent).toContain("First zest");
    expect(tiles[2]?.textContent).toContain("First berry");
    expect(bodyText()).toContain("Reach a 2-day streak");
  });

  it("shows the first medal when none are unlocked, and the next plum's stem goals", () => {
    render(plum);
    expect(hostText()).toContain("Plum bud");
    const button = host.querySelector("button");
    expect(button?.getAttribute("aria-label")).toContain("0 of 2");
    expect(hostText()).not.toContain("4/5");
    clickButton(0);
    expect(bodyText()).toContain("4/5 · 40/50");
    expect(bodyText().split("Plum bud").length - 1).toBeGreaterThanOrEqual(2);
  });
});
