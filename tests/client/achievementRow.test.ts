/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import AchievementRow from "../../src/achievements/AchievementRow";
import type {
  AchievementItem,
  AchievementProgress,
} from "../../src/achievements/wire";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const item = (
  progress: AchievementProgress,
  completedAt: string | null = null,
): AchievementItem => ({
  def: {
    id: "plum_scholar",
    category: "prestige",
    fruitType: "plum",
    rarity: "legendary",
    title: "Sugar plum",
    description: "Best streak 30+ and 200 lifetime reviews.",
    sortOrder: 120,
  },
  progress,
  completedAt,
  traits: { shine: "max", colour: "deep", status: "ripe" },
});

const plum = (streak: number, reviews: number): AchievementProgress => ({
  kind: "composite",
  parts: [
    { key: "streak_best", current: streak, target: 30 },
    { key: "reviews", current: reviews, target: 200 },
  ],
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

function render(
  row: AchievementItem,
  descriptionMode?: "always" | "hover",
): string {
  act(() => {
    root.render(
      createElement(AchievementRow, {
        item: row,
        staggerIndex: 0,
        sheenOnce: false,
        descriptionMode,
      }),
    );
  });
  return host.textContent ?? "";
}

const bars = () => host.querySelectorAll('[role="progressbar"]').length;

describe("AchievementRow", () => {
  it("shows the count bar as n / threshold", () => {
    const text = render(
      item({ kind: "count", currentValue: 3, threshold: 10 }),
    );
    expect(text).toContain("3 / 10");
    expect(bars()).toBe(1);
  });

  it("shows both Sugar plum bars", () => {
    const text = render(item(plum(12, 150)));
    expect(text).toContain("Best streak 12 / 30");
    expect(text).toContain("Reviews 150 / 200");
    expect(bars()).toBe(2);
    expect(text).not.toContain("Almost there");
  });

  it("cues Almost there only when every part is at 80% or more", () => {
    expect(render(item(plum(24, 160)))).toContain("Almost there");
    expect(render(item(plum(29, 159)))).not.toContain("Almost there");
  });

  it("shows Unlocked with no bars once completed", () => {
    const text = render(item(plum(30, 200), "2026-10-30T10:00:00.000Z"));
    expect(text).toContain("Unlocked");
    expect(text).not.toContain("Almost there");
    expect(bars()).toBe(0);
  });

  it("leaves the default caption without medal-desc", () => {
    render(item({ kind: "count", currentValue: 3, threshold: 10 }));
    expect(host.querySelector(".medal-desc")).toBeNull();
  });

  it("keeps the hover caption in the DOM", () => {
    const text = render(
      item({ kind: "count", currentValue: 3, threshold: 10 }),
      "hover",
    );
    expect(text).toContain("Best streak 30+ and 200 lifetime reviews.");
    expect(host.querySelector(".medal-desc")).not.toBeNull();
    expect(host.querySelector("[tabindex='0']")).not.toBeNull();
  });
});
