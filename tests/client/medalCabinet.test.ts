/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MedalCabinet from "../../src/achievements/MedalCabinet";
import type { AchievementItem, AchievementProgress } from "../../src/achievements/wire";

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
      createElement(MedalCabinet, { items, sheenIds: new Set<string>() }),
    );
  });
}

function text(): string {
  return host.textContent ?? "";
}

function clickButton(index: number) {
  const button = host.querySelectorAll("button")[index];
  if (!button) throw new Error("missing tile button");
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("MedalCabinet", () => {
  it("titles the tile with the highest unlocked medal", () => {
    render(apple);
    expect(text()).toContain("Orchard regular");
    expect(text()).toContain("3 of 5");
    expect(text()).not.toContain("Full bushel");
    expect(text().split("Orchard regular").length - 1).toBe(1);
  });

  it("opens the rest of the fruit with progress, then closes", () => {
    render(apple);
    clickButton(0);
    expect(text()).toContain("Full bushel");
    expect(text()).toContain("180 / 500");
    expect(text()).toContain("Golden apple");
    expect(text().split("Orchard regular").length - 1).toBe(1);
    clickButton(0);
    expect(text()).not.toContain("Full bushel");
  });

  it("keeps a single fruit open", () => {
    render([...apple, ...lemon]);
    clickButton(0);
    expect(text()).toContain("Full bushel");
    clickButton(1);
    expect(text()).not.toContain("Full bushel");
    expect(text()).toContain("Lemon grove");
    expect(text()).toContain("40 / 100");
  });

  it("closes the open ladder on Escape", () => {
    render(apple);
    clickButton(0);
    const tile = host.querySelector(".medal-tile");
    if (!tile) throw new Error("missing tile");
    act(() => {
      tile.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(text()).not.toContain("Full bushel");
  });

  it("returns focus to the tile button on Escape", () => {
    render(apple);
    clickButton(0);
    const button = host.querySelector("button");
    const tile = host.querySelector(".medal-tile");
    if (!button || !tile) throw new Error("missing tile");
    act(() => {
      tile.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.activeElement).toBe(button);
  });

  it("renders the tile title as a span", () => {
    render(apple);
    const button = host.querySelector("button");
    expect(button?.querySelector("h6")).toBeNull();
    expect(button?.querySelector("span")?.textContent).toContain("Orchard regular");
  });

  it("moves an open right-column tile to the start of its row", () => {
    render([...apple, ...lemon]);
    clickButton(1);
    const tiles = host.querySelectorAll(".medal-tile");
    expect(tiles[0]?.textContent).toContain("First zest");
    expect(tiles[1]?.textContent).toContain("Orchard regular");
  });

  it("moves an open third tile to the start of its row", () => {
    render([...apple, ...lemon, ...strawberry]);
    clickButton(2);
    const tiles = host.querySelectorAll(".medal-tile");
    expect(tiles[0]?.textContent).toContain("First berry");
    expect(tiles[1]?.textContent).toContain("Orchard regular");
    expect(tiles[2]?.textContent).toContain("First zest");
  });

  it("shows the first medal when none are unlocked, and the next plum's bars", () => {
    render(plum);
    expect(text()).toContain("Plum bud");
    expect(text()).toContain("0 of 2");
    expect(text()).not.toContain("Best streak 4 / 5");
    clickButton(0);
    expect(text()).toContain("Best streak 4 / 5");
    expect(text()).toContain("Reviews 40 / 50");
    expect(text().split("Plum bud").length - 1).toBe(1);
  });
});
